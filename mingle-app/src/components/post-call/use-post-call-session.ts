'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  NATIVE_VOICE_EVENT,
  setVoiceTalkInterpret,
  setVoiceTalkListen,
  setVoiceTalkListenLang,
  type VoiceTalkCaptionLine,
} from '@/components/LivePhoneDemo/VoiceTalkPanel'
import { usePostCallRoom } from '@/components/LivePhoneDemo/use-post-call-room'
import { buildClientApiPath } from '@/lib/api-contract'
import { ensureCoinsForPaidFeature, isCoinBillingActive, notifyCoinsExhausted, useCoinWallet } from '@/lib/coin-wallet-client'
import { setLiveRoomOwnCall } from '@/lib/live-room-bubble'
import { isPostCallOver, postCallInterpretsByDefault, type PostCallView } from '@/lib/post-call'
import { closePostCall } from '@/lib/post-call-session'

type NativeBridge = { postMessage: (data: string) => void }
function bridgePost(command: Record<string, unknown>): void {
  const bridge = typeof window === 'undefined' ? null : (window as unknown as { ReactNativeWebView?: NativeBridge }).ReactNativeWebView
  bridge?.postMessage(JSON.stringify(command))
}

type Member = { userId: string; isLocal: boolean; isSpeaking: boolean; micOn?: boolean; lang?: string }
type Snapshot = { members?: Member[]; micOn?: boolean; interpretOn?: boolean; listenOn?: boolean; captions?: VoiceTalkCaptionLine[] }
type Phase = 'idle' | 'connecting' | 'connected' | 'left' | 'error'

/** One line on the call screen: something said (a caption) or written (or a photo). */
export type PostCallTimelineLine = {
  id: string
  mine: boolean
  text: string
  /** In the viewer's language (or, for the viewer's own line, in the other person's). */
  translation: string | null
  imageUrl: string | null
  /** Still being said. */
  partial: boolean
  at: number
}

type WrittenLine = { id: string; userId: string; text: string; language: string; translations: Record<string, string>; imageUrl: string | null; createdAt: string }

type KeptCaption = { line: VoiceTalkCaptionLine; at: number }

/** The captions kept so far, with the app's latest report folded in (a line keeps the moment it first came). */
export function mergeCaptions(current: ReadonlyMap<string, KeptCaption>, incoming: readonly VoiceTalkCaptionLine[], now: number): ReadonlyMap<string, KeptCaption> {
  let next: Map<string, KeptCaption> | null = null
  for (const line of incoming) {
    if (line.isEcho || !line.original?.trim()) continue
    const known = current.get(line.id)
    if (known && known.line.original === line.original && known.line.isPartial === line.isPartial
      && JSON.stringify(known.line.translations ?? {}) === JSON.stringify(line.translations ?? {})) continue
    next ??= new Map(current)
    next.set(line.id, { line, at: known?.at ?? now })
  }
  return next ?? current
}

const LINES_POLL_MS = 2_500
/** After the call is over, how long the screen says so before it closes. */
const OVER_SHOWN_MS = 1_600

function base(language: string | null | undefined): string {
  return (language ?? '').trim().toLowerCase().split(/[-_]/)[0] ?? ''
}

function pick(translations: Record<string, string> | undefined, language: string): string | null {
  if (!translations || !language) return null
  for (const [key, value] of Object.entries(translations)) {
    if (base(key) === base(language) && value.trim()) return value
  }
  return null
}

/**
 * Everything the call screen of a 1:1 voice talk needs, running while the
 * call is up, shown or folded into the bubble (owner, 2026-11-26): the call's
 * state on the server, the voice in the app (LiveKit, as the room voice talk),
 * its switches, what is said (captions) and written (lines).
 */
export function usePostCallSession(input: { initial: PostCallView; viewerId: string | null; myLanguage: string; expanded: boolean }) {
  const { initial, viewerId, myLanguage, expanded } = input
  const conversationId = initial.conversationId
  const room = usePostCallRoom(conversationId, true)
  const call = room.call ?? initial
  const status = call.status
  const over = room.loaded && (room.call === null || isPostCallOver(status))
  const peer = call.peer
  const coinWallet = useCoinWallet().wallet
  const walletExhausted = isCoinBillingActive(coinWallet) && coinWallet?.exhausted === true

  // The generic room bubble stays away from this call: it has its own.
  useEffect(() => {
    setLiveRoomOwnCall(conversationId)
    return () => setLiveRoomOwnCall(null)
  }, [conversationId])

  // ---- the voice, in the app ----
  const [phase, setPhase] = useState<Phase>('idle')
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  // The switches: the app's report is the truth, but a press shows at once and is not undone by an older report.
  const [micOn, setMicOn] = useState(true)
  const [interpretOn, setInterpretOn] = useState(false)
  const [listenOn, setListenOn] = useState(false)
  const pressedUntilRef = useRef(0)
  // What is said: the call's captions, kept as they come (the app holds only the recent ones).
  const [captions, setCaptions] = useState<ReadonlyMap<string, KeptCaption>>(() => new Map())
  const phaseRef = useRef<Phase>('idle')
  useEffect(() => {
    const onEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ type?: string; phase?: Phase; conversationId?: string | null; snapshot?: Snapshot }>).detail
      if (!detail || (detail.conversationId && detail.conversationId !== conversationId)) return
      if (detail.type === 'state' && detail.phase) {
        phaseRef.current = detail.phase
        setPhase(detail.phase)
        if (detail.phase === 'left' || detail.phase === 'error') setSnapshot(null)
      } else if (detail.type === 'room' && detail.snapshot) {
        setSnapshot(detail.snapshot)
        const report = detail.snapshot
        if (Date.now() >= pressedUntilRef.current) {
          if (typeof report.micOn === 'boolean') setMicOn(report.micOn)
          if (typeof report.interpretOn === 'boolean') {
            setInterpretOn(report.interpretOn)
            setListenOn(report.interpretOn && report.listenOn !== false)
          }
        }
        const incoming = detail.snapshot.captions
        if (Array.isArray(incoming) && incoming.length > 0) setCaptions((current) => mergeCaptions(current, incoming, Date.now()))
      }
    }
    window.addEventListener(NATIVE_VOICE_EVENT, onEvent)
    bridgePost({ type: 'native_voice_status_request', payload: { conversationId } })
    return () => window.removeEventListener(NATIVE_VOICE_EVENT, onEvent)
  }, [conversationId])

  // Answered: this phone joins, once per call.
  const joinedCallRef = useRef<string | null>(null)
  useEffect(() => {
    if (status !== 'accepted' || joinedCallRef.current === call.id) return
    joinedCallRef.current = call.id
    if (phaseRef.current === 'connecting' || phaseRef.current === 'connected') return
    bridgePost({ type: 'native_voice_open', payload: { conversationId, title: peer.name, lang: myLanguage, interpret: false } })
  }, [call.id, conversationId, myLanguage, peer.name, status])

  const members = useMemo(() => snapshot?.members ?? [], [snapshot])
  const self = members.find((member) => member.isLocal) ?? null
  const peerMember = members.find((member) => member.userId === peer.userId) ?? null
  const connected = phase === 'connected'
  const talking = status === 'accepted' && connected && Boolean(peerMember)

  // ---- switches (the app's report is the truth; a press shows at once) ----

  const toggleMic = useCallback(() => {
    pressedUntilRef.current = Date.now() + 3000
    setMicOn((on) => {
      bridgePost({ type: 'native_voice_set', payload: { mic: !on } })
      return !on
    })
  }, [])

  const applyInterpret = useCallback((on: boolean, listen: boolean) => {
    pressedUntilRef.current = Date.now() + 3000
    setInterpretOn(on)
    setListenOn(on && listen)
    if (on) setVoiceTalkListenLang(myLanguage)
    setVoiceTalkListen(on && listen)
    void setVoiceTalkInterpret(conversationId, on).then((accepted) => {
      if (accepted) return
      setInterpretOn(false)
      setListenOn(false)
      notifyCoinsExhausted({ userInitiated: true })
    })
  }, [conversationId, myLanguage])

  const toggleInterpret = useCallback(() => {
    if (!interpretOn && !ensureCoinsForPaidFeature()) return
    applyInterpret(!interpretOn, listenOn || !interpretOn)
  }, [applyInterpret, interpretOn, listenOn])

  const toggleListen = useCallback(() => {
    // Reading aloud is part of interpreting: off, it turns both on.
    if (!interpretOn) {
      if (!ensureCoinsForPaidFeature()) return
      applyInterpret(true, true)
      return
    }
    pressedUntilRef.current = Date.now() + 3000
    setListenOn((on) => {
      setVoiceTalkListen(!on)
      return !on
    })
  }, [applyInterpret, interpretOn])

  // Translation and read-aloud start on by themselves only when the two speak
  // different languages (owner, 2026-11-25), once per call, never with no Hash.
  const defaultsAppliedRef = useRef<string | null>(null)
  const peerLanguage = peerMember?.lang || peer.language || ''
  useEffect(() => {
    if (!talking || defaultsAppliedRef.current === call.id) return
    const timer = window.setTimeout(() => {
      defaultsAppliedRef.current = call.id
      if (!postCallInterpretsByDefault(myLanguage, peerLanguage) || walletExhausted || interpretOn) return
      applyInterpret(true, true)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [applyInterpret, call.id, interpretOn, myLanguage, peerLanguage, talking, walletExhausted])

  // ---- ending ----
  const endedHereRef = useRef(false)
  const hangUp = useCallback(() => {
    endedHereRef.current = true
    bridgePost({ type: 'native_voice_close' })
    void room.act('hangup').finally(() => closePostCall())
  }, [room])
  const accept = useCallback(() => { void room.act('accept') }, [room])
  useEffect(() => {
    if (!over) return
    if (phaseRef.current === 'connecting' || phaseRef.current === 'connected') bridgePost({ type: 'native_voice_close' })
    const timer = window.setTimeout(() => closePostCall(), endedHereRef.current ? 0 : OVER_SHOWN_MS)
    return () => window.clearTimeout(timer)
  }, [over])
  useEffect(() => () => { bridgePost({ type: 'native_voice_status_stop' }) }, [])


  // ---- what is written ----
  const [written, setWritten] = useState<WrittenLine[]>([])
  const readLines = useCallback(async () => {
    const body = await fetch(buildClientApiPath(`/post-calls/${encodeURIComponent(call.id)}/lines`), { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null) as { lines?: WrittenLine[] } | null
    if (Array.isArray(body?.lines)) setWritten(body.lines)
  }, [call.id])
  useEffect(() => {
    if (!expanded || status !== 'accepted') return
    const first = window.setTimeout(() => { void readLines() }, 0)
    const timer = window.setInterval(() => { void readLines() }, LINES_POLL_MS)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(timer)
    }
  }, [expanded, readLines, status])

  const sendText = useCallback(async (text: string) => {
    const clean = text.trim()
    if (!clean) return false
    const clientId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
    const optimistic: WrittenLine = { id: `local-${clientId}`, userId: viewerId ?? '', text: clean, language: myLanguage, translations: {}, imageUrl: null, createdAt: new Date().toISOString() }
    setWritten((current) => [...current, optimistic])
    const response = await fetch(buildClientApiPath(`/post-calls/${encodeURIComponent(call.id)}/lines`), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: clean, clientId }),
    }).catch(() => null)
    const body = response?.ok ? await response.json().catch(() => null) as { line?: WrittenLine } | null : null
    setWritten((current) => current.map((line) => (line.id === optimistic.id && body?.line ? body.line : line)))
    return Boolean(body?.line)
  }, [call.id, myLanguage, viewerId])

  const sendPhoto = useCallback(async (file: File) => {
    const form = new FormData()
    form.set('file', file)
    form.set('clientMessageId', `postcall-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`)
    const response = await fetch(buildClientApiPath(`/conversations/${encodeURIComponent(conversationId)}/images`), { method: 'POST', body: form }).catch(() => null)
    if (response?.ok) void readLines()
    return Boolean(response?.ok)
  }, [conversationId, readLines])

  const timeline = useMemo<PostCallTimelineLine[]>(() => {
    const lines: PostCallTimelineLine[] = []
    if (interpretOn) {
      for (const { line, at } of captions.values()) {
        const mine = line.speaker === viewerId
        lines.push({
          id: `caption-${line.id}`,
          mine,
          text: line.original,
          translation: pick(line.translations, mine ? peerLanguage : myLanguage),
          imageUrl: null,
          partial: line.isPartial,
          at,
        })
      }
    }
    for (const line of written) {
      const mine = line.userId === viewerId
      lines.push({
        id: line.id,
        mine,
        text: line.text,
        translation: pick(line.translations, mine ? peerLanguage : myLanguage),
        imageUrl: line.imageUrl,
        partial: false,
        at: Date.parse(line.createdAt) || Number.MAX_SAFE_INTEGER,
      })
    }
    return lines.sort((left, right) => left.at - right.at)
  }, [captions, interpretOn, myLanguage, peerLanguage, viewerId, written])

  return {
    call,
    status,
    over,
    secondsLeft: room.secondsLeft,
    busy: room.busy,
    phase,
    talking,
    selfSpeaking: Boolean(self?.isSpeaking) && micOn,
    peerSpeaking: Boolean(peerMember?.isSpeaking),
    peerMicOn: peerMember ? peerMember.micOn !== false : true,
    micOn,
    interpretOn,
    listenOn,
    toggleMic,
    toggleInterpret,
    toggleListen,
    accept,
    hangUp,
    timeline,
    sendText,
    sendPhoto,
  }
}

export type PostCallSession = ReturnType<typeof usePostCallSession>

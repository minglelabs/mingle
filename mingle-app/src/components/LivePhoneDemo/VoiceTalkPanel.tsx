'use client'

// Group voice talk inside the chat room (KakaoTalk style: the room stays the
// same room, voice is switched on and off). A panel slides down from under the
// top bar with the people in the call (up to 8); drag it up (or tap the handle) to fold it into a
// slim bar.
//
// In a call the room's own Start/Stop and speaker buttons are locked, and the
// panel has the two switches that matter: the mic button owns the voice sent
// into the call, and the interpret button turns on captions and the
// interpreted voice of what the others say. The server's interpreter writes
// down the call while anyone has it on; those lines are call captions, read
// only by the people who had it on (and whoever said them), never by the rest
// of the room. See src/lib/voice-caption.ts.
//
// The call itself runs in the native app (LiveKit audio). This panel only
// draws it and sends button presses over the RN bridge (see
// rn/src/voice/voiceBridge.ts for the message shapes).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, type PanInfo } from 'framer-motion'
import { ArrowDown, ArrowUp, ChevronUp, Hand, Headphones, Languages, Mic, MicOff, PhoneOff, Phone, Plus, Volume2, VolumeX } from 'lucide-react'
import LanguageFlag from '@/components/language-flag'
import VoiceTalkParticipantStrip, { sameVoiceTalkParticipants, type VoiceTalkParticipantChip } from './VoiceTalkParticipantStrip'
import { buildClientApiPath, clientApiNamespace, namespaceSupportsVoiceTalk } from '@/lib/api-contract'
import { useRoomPresence } from '@/lib/room-presence'
import { rememberLiveRoom } from '@/lib/live-room-bubble'
import { voiceStageCopy } from '@/i18n/voice-stage-copy'
import { voiceRoomCopy } from '@/i18n/voice-room-copy'
import VoiceRoomStage from './VoiceRoomStage'
import { resolveVoiceStage, voiceStageTransition, type VoiceStageRole } from './voice-talk-stage'
import { useNativeBannerSuppression } from '@/lib/use-native-banner-suppression'
import { VOICE_TALK_MAX_SEATS, voiceTalkCopy } from '@/i18n/voice-talk-copy'
import { readDeclinedInvite, writeDeclinedInvite } from '@/lib/declined-invites'
import { ensureCoinsForPaidFeature, isCoinBillingActive, notifyCoinsExhausted, refreshCoinWallet, useCoinWallet } from '@/lib/coin-wallet-client'

// How often the wallet is read while paid interpretation is on.
const INTERPRET_WALLET_POLL_MS = 15_000

export const NATIVE_VOICE_EVENT = 'mingle:native-voice'
const MAX_SEATS = VOICE_TALK_MAX_SEATS

// `role` and `handRaised` come with an open room's call (it has a stage).
type CallParticipant = { userId: string; name: string | null; image: string | null; speechLanguage?: string | null; role?: string; handRaised?: boolean }
// `startedBy` comes from servers that send it.
type StatusCall = { id: string; participants: CallParticipant[]; maxParticipants: number; startedBy?: { userId: string; name: string | null } | null; stage?: { hostUserId: string } | null } | null
// `lang` and `micOn` come from app builds that share them; older builds send neither.
// `interpretOff` is false only for a member who turned interpretation on.
type RoomMember = { identity: string; userId: string; name: string; isLocal: boolean; isSpeaking: boolean; lang?: string; micOn?: boolean; interpretOff?: boolean }
type RoomSnapshot = {
  status: string
  /** Language the app joined with; its translation lane is the one we hear. */
  myLang?: string
  members: RoomMember[]
  micOn: boolean
  micAvailable: boolean
  interpretOn: boolean
  /** Builds from 2026-11-11 on. */
  listenOn?: boolean
  /** The interpreter's lines, newest first (partial while being said). */
  captions?: VoiceTalkCaptionLine[]
  /** Builds from 2026-11-18 on: the language translations are read aloud in. */
  listenLang?: string
  /** Builds from 2026-11-18 on: the line being read aloud to this phone now. */
  readingLineId?: string | null
}

/** One line the call's interpreter is writing down (or just wrote down). */
export type VoiceTalkCaptionLine = {
  id: string
  /** The speaker's user id; builds from 2026-11-12 on. */
  speaker?: string
  speakerName: string
  lang: string
  original: string
  /** Per-language translations so far (clause by clause while it is said). */
  translations?: Record<string, string>
  isPartial: boolean
  isEcho: boolean
}
type Phase = 'idle' | 'connecting' | 'connected' | 'left' | 'error'

type VoiceEvent =
  | { type: 'state'; phase: Phase; conversationId: string | null; errorKind?: string }
  | { type: 'status'; conversationId: string; call: StatusCall }
  | { type: 'room'; conversationId: string; snapshot: RoomSnapshot }

type NativeBridge = { postMessage: (data: string) => void }

function bridge(): NativeBridge | null {
  if (typeof window === 'undefined') return null
  const b = (window as unknown as { ReactNativeWebView?: NativeBridge }).ReactNativeWebView
  return b && typeof b.postMessage === 'function' ? b : null
}

function post(command: Record<string, unknown>) {
  bridge()?.postMessage(JSON.stringify(command))
}

// The call this phone is in, remembered across an app restart. A restart
// drops the connection without telling the server, which would keep this
// phone's seat taken (and this viewer shown as in the call) until the server
// notices. The next time the room opens, a remembered call that this phone
// is no longer connected to is left explicitly.
const JOINED_CALL_STORAGE_PREFIX = 'mingle_voice_joined_call:'

function readJoinedCallMarker(conversationId: string): string | null {
  try {
    return window.localStorage.getItem(JOINED_CALL_STORAGE_PREFIX + conversationId)
  } catch {
    return null
  }
}

function writeJoinedCallMarker(conversationId: string, callId: string | null): void {
  try {
    if (callId) window.localStorage.setItem(JOINED_CALL_STORAGE_PREFIX + conversationId, callId)
    else window.localStorage.removeItem(JOINED_CALL_STORAGE_PREFIX + conversationId)
  } catch {
    // No storage: the server frees the seat by itself a little later.
  }
}

/**
 * Whether the room's call is one this phone was in before a restart and is
 * no longer connected to: remembered here, still listing this viewer on the
 * server, and not joined by the app now.
 */
export function isAbandonedJoinedCall(input: {
  rememberedCallId: string | null
  call: { id: string; participants: ReadonlyArray<{ userId: string }> } | null
  viewerUserId: string | null
  joinedNow: boolean
}): boolean {
  if (input.joinedNow || !input.call || !input.rememberedCallId || !input.viewerUserId) return false
  return input.rememberedCallId === input.call.id
    && input.call.participants.some((participant) => participant.userId === input.viewerUserId)
}

/** How long "this phone left the call it remembers" must hold before its seat is given up. */
const ABANDONED_CALL_CONFIRM_MS = 2_500
const RESEAT_MIN_GAP_MS = 15_000

export function isVoiceTalkAvailable(): boolean {
  // The app shell's bridge alone is not enough: apps before 2.5.0 have it but no voice host.
  return bridge() !== null && namespaceSupportsVoiceTalk(clientApiNamespace)
}

function initial(name: string | null | undefined): string {
  const trimmed = (name || '').trim()
  return trimmed ? Array.from(trimmed)[0].toUpperCase() : '?'
}

/** Joins the room's call, starting it when none is live (one call per room, kept by the server). */
export function joinVoiceTalk(input: { conversationId: string; title?: string; lang: string }) {
  // The live room bubble names the room, and "undo" after leaving from it joins again in this language.
  rememberLiveRoom(input.conversationId, { title: input.title, lang: input.lang })
  post({
    type: 'native_voice_open',
    payload: { conversationId: input.conversationId, title: input.title, lang: input.lang, interpret: false },
  })
}

/** Switches the voice this phone sends into the call. */
export function setVoiceTalkMic(on: boolean) {
  post({ type: 'native_voice_set', payload: { mic: on } })
}

/**
 * Turns this viewer's interpretation on or off: in the call (the interpreter
 * joins for it, and this phone listens to its language's track) and on the
 * server (it decides who reads each caption).
 */
export async function setVoiceTalkInterpret(conversationId: string, on: boolean): Promise<boolean> {
  // The call at once (its reports then agree with the button), the server
  // right after.
  post({ type: 'native_voice_set', payload: { interpret: on } })
  const response = await fetch(buildClientApiPath(`/conversations/${encodeURIComponent(conversationId)}/voice/interpret`), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ on }),
  }).catch(() => null)
  // 402: no Hash. The call's switch goes back off; the caller opens the sheet.
  if (on && response?.status === 402) {
    post({ type: 'native_voice_set', payload: { interpret: false } })
    return false
  }
  return true
}

/** The language the call reads translations aloud in (the room's speaker mode pick). */
export function setVoiceTalkListenLang(lang: string): void {
  post({ type: 'native_voice_set', payload: { listenLang: lang } })
}

/** Turns the translations read aloud on or off; interpretation (captions) stays as it is. */
export function setVoiceTalkListen(on: boolean): void {
  post({ type: 'native_voice_set', payload: { listen: on } })
}

/** The call's mic: on unless the viewer only listens. The room's speech-to-text does not move it. */
export function resolveVoiceTalkMic(input: { listenOnly: boolean }): boolean {
  return !input.listenOnly
}

/**
 * What a press on the room's voice talk button does. Every answer is a
 * question first: start a call, join the one in progress, or leave the one
 * this phone is in.
 */
export function resolveVoiceTalkButtonPress(state: { joined: boolean; live?: boolean }): 'confirm_start' | 'confirm_join' | 'confirm_leave' {
  if (state.joined) return 'confirm_leave'
  return state.live ? 'confirm_join' : 'confirm_start'
}

export type VoiceTalkPanelProps = {
  conversationId: string
  conversationTitle?: string
  uiLocale: string
  /** The language this user speaks (STT source) and listens in. */
  myLang: string
  /** Pixels from the top of the room screen to the bottom of the top bar. */
  topOffset: string
  /** The room's call as this phone sees it; `connected` is a call this phone is in, `callId` the live call. */
  onAvailabilityChange?: (state: { live: boolean; joined: boolean; connected: boolean; callId: string | null }) => void
  /** Who is in the room's live call (empty when none), for the room's "started a voice talk" message. */
  onParticipantsChange?: (participants: VoiceTalkParticipantChip[]) => void
  /** Bumped by the room's voice talk button outside a call: asks whether to start (or join) one. */
  openSignal?: number
  /** Bumped by the room's voice talk button during a call: asks whether to leave. */
  leaveSignal?: number
  /** Listen only: in a seat, sending no voice. Owned by the room (it drives the mic). */
  listenOnly?: boolean
  onListenOnlyChange?: (listenOnly: boolean) => void
  /** The app reported its mic (on returning to the room): show it, switch nothing. */
  onListenOnlySync?: (listenOnly: boolean) => void
  /** Interpretation (captions and the interpreted voice of the others) is on for this viewer. Owned by the room. */
  interpretOn?: boolean
  onInterpretChange?: (on: boolean) => void
  /** Translations read aloud, on while interpretation is on unless turned off. Owned by the room. */
  listenOn?: boolean
  onListenChange?: (on: boolean) => void
  /** The app reported interpretation and read-aloud (on returning to the room): show them, switch nothing. */
  onInterpretSync?: (state: { interpretOn: boolean; listenOn: boolean }) => void
  /** The interpreter's lines as the app has them, on every room update. */
  onCaptions?: (lines: VoiceTalkCaptionLine[]) => void
  /** The line being read aloud to this phone (and in which language), or null. */
  onReadingChange?: (reading: { lineId: string, lang: string } | null) => void
  /** Earphones are in: the read-aloud button shows them instead of the speaker. */
  earphonesConnected?: boolean
  /** Opens a member's profile when their seat is tapped. */
  onOpenProfile?: (userId: string) => void
  /** This viewer's account id: always counted as having the room open. */
  viewerUserId?: string | null
  /**
   * 'room': the voice room screen of an open room (owner, 2026-11-25): the
   * stage is always there under the top bar (VoiceRoomStage), in the call or
   * not. 'panel' (default): the strip of a chat room's call, shown only
   * while this phone is in it.
   */
  variant?: 'panel' | 'room'
  /** 'room' only: the stage's height in px (0 when gone), so the chat starts below it. */
  onHeightChange?: (heightPx: number) => void
}

export default function VoiceTalkPanel(props: VoiceTalkPanelProps) {
  const { conversationId, conversationTitle, myLang, openSignal, leaveSignal, onAvailabilityChange, onParticipantsChange, onListenOnlyChange, onOpenProfile } = props
  const listenOnly = props.listenOnly === true
  const interpretOn = props.interpretOn === true
  const { onInterpretChange, onListenChange } = props
  const listenOn = props.listenOn !== false
  const viewerUserId = props.viewerUserId ?? null
  const copy = voiceTalkCopy(props.uiLocale)
  const coinWallet = useCoinWallet().wallet
  // Interpretation is paid. While it is on the wallet is read more often than
  // the app's usual minute, and when the Hash run out the switch goes off and
  // the "out of Hash" sheet opens (the server stops the captions on its side).
  const interpretingOnHash = props.interpretOn === true && isCoinBillingActive(coinWallet)
  useEffect(() => {
    if (!interpretingOnHash) return
    const timer = window.setInterval(() => { void refreshCoinWallet() }, INTERPRET_WALLET_POLL_MS)
    return () => window.clearInterval(timer)
  }, [interpretingOnHash])
  const outOfHashWhileInterpreting = interpretingOnHash && coinWallet?.exhausted === true
  useEffect(() => {
    if (!outOfHashWhileInterpreting) return
    props.onInterpretChange?.(false)
    notifyCoinsExhausted({ userInitiated: true })
    // Only the transition matters; the handler identity does not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outOfHashWhileInterpreting])
  const [call, setCall] = useState<StatusCall>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [room, setRoom] = useState<RoomSnapshot | null>(null)
  const [folded, setFolded] = useState(false)
  // The voice talk button outside a call: "start a voice talk?" (or "join?").
  const [startPrompt, setStartPrompt] = useState(false)
  // A call this phone declined is not offered again by itself; its message in
  // the room still joins it.
  // Kept on the device too: a declined call is not offered again after a restart.
  const [declined, setDeclined] = useState<{ conversationId: string, callId: string | null } | null>(null)
  const declinedCallId = declined && declined.conversationId === conversationId
    ? declined.callId
    : readDeclinedInvite('voice-talk', conversationId)
  const setDeclinedCallId = useCallback((callId: string | null) => {
    writeDeclinedInvite('voice-talk', conversationId, callId)
    setDeclined({ conversationId, callId })
  }, [conversationId])

  const joined = phase === 'connecting' || phase === 'connected'
  // The phase as the event handler below needs it (it outlives a render).
  const phaseRef = useRef<Phase>('idle')
  const abandonTimerRef = useRef<number | null>(null)
  const reseatAtRef = useRef(0)
  const myLangRef = useRef(myLang)
  useEffect(() => { myLangRef.current = myLang }, [myLang])
  const interpretOnRef = useRef(interpretOn)
  useEffect(() => { interpretOnRef.current = interpretOn }, [interpretOn])
  const onListenOnlySyncRef = useRef(props.onListenOnlySync)
  useEffect(() => { onListenOnlySyncRef.current = props.onListenOnlySync }, [props.onListenOnlySync])
  const onInterpretSyncRef = useRef(props.onInterpretSync)
  useEffect(() => { onInterpretSyncRef.current = props.onInterpretSync }, [props.onInterpretSync])
  const onCaptionsRef = useRef(props.onCaptions)
  useEffect(() => { onCaptionsRef.current = props.onCaptions }, [props.onCaptions])
  const onReadingChangeRef = useRef(props.onReadingChange)
  useEffect(() => { onReadingChangeRef.current = props.onReadingChange }, [props.onReadingChange])

  useEffect(() => {
    if (!conversationId || !bridge()) return
    const onEvent = (event: Event) => {
      const detail = (event as CustomEvent<VoiceEvent>).detail
      if (!detail || ('conversationId' in detail && detail.conversationId && detail.conversationId !== conversationId)) return
      if (detail.type === 'status') {
        // A call remembered from before a restart, which the app is not in
        // now, is left: this viewer gives up its seat.
        const joinedNow = phaseRef.current === 'connecting' || phaseRef.current === 'connected'
        if (isAbandonedJoinedCall({ rememberedCallId: readJoinedCallMarker(conversationId), call: detail.call, viewerUserId, joinedNow }) && detail.call) {
          // Not at once: after the page reloads, a status from the app's old
          // poll can arrive before the app says it is still in the call.
          if (abandonTimerRef.current === null) {
            abandonTimerRef.current = window.setTimeout(() => {
              abandonTimerRef.current = null
              if (phaseRef.current === 'connecting' || phaseRef.current === 'connected') return
              writeJoinedCallMarker(conversationId, null)
              void fetch(buildClientApiPath(`/conversations/${encodeURIComponent(conversationId)}/voice/leave`), { method: 'POST' }).catch(() => undefined)
              setCall((current) => current ? { ...current, participants: current.participants.filter((p) => p.userId !== viewerUserId) } : current)
            }, ABANDONED_CALL_CONFIRM_MS)
          }
        }
        // In the call, but the server has this viewer's seat as left: take it
        // again (and say again that interpretation is on), or nobody reads
        // the captions and their lines are never saved.
        if (phaseRef.current === 'connected' && detail.call && viewerUserId
          && !detail.call.participants.some((p) => p.userId === viewerUserId)
          && Date.now() - reseatAtRef.current > RESEAT_MIN_GAP_MS) {
          reseatAtRef.current = Date.now()
          const base = buildClientApiPath(`/conversations/${encodeURIComponent(conversationId)}/voice`)
          const json = { method: 'POST', headers: { 'content-type': 'application/json' } }
          void fetch(`${base}/token`, { ...json, body: JSON.stringify({ lang: myLangRef.current }) })
            .then((response) => (response.ok && interpretOnRef.current
              ? fetch(`${base}/interpret`, { ...json, body: JSON.stringify({ on: true }) })
              : undefined))
            .catch(() => undefined)
        }
        setCall(detail.call)
      } else if (detail.type === 'room') {
        setRoom(detail.snapshot)
        // The app's mic is the truth: a muted call stays muted however often
        // this screen is closed and opened.
        if (detail.snapshot && typeof detail.snapshot.micOn === 'boolean') onListenOnlySyncRef.current?.(!detail.snapshot.micOn)
        onCaptionsRef.current?.(Array.isArray(detail.snapshot?.captions) ? detail.snapshot.captions : [])
        const readingLineId = typeof detail.snapshot?.readingLineId === 'string' ? detail.snapshot.readingLineId : null
        const listenLang = typeof detail.snapshot?.listenLang === 'string' ? detail.snapshot.listenLang : ''
        onReadingChangeRef.current?.(readingLineId && listenLang ? { lineId: readingLineId, lang: listenLang } : null)
        // Interpretation and read-aloud too: they go on with the room closed.
        if (detail.snapshot && typeof detail.snapshot.interpretOn === 'boolean') {
          onInterpretSyncRef.current?.({ interpretOn: detail.snapshot.interpretOn, listenOn: detail.snapshot.listenOn !== false })
        }
      }
      else if (detail.type === 'state') {
        phaseRef.current = detail.phase
        if ((detail.phase === 'connecting' || detail.phase === 'connected') && abandonTimerRef.current !== null) {
          window.clearTimeout(abandonTimerRef.current)
          abandonTimerRef.current = null
        }
        if (detail.phase === 'left') writeJoinedCallMarker(conversationId, null)
        setPhase(detail.phase)
        if (detail.phase === 'error') setError(detail.errorKind === 'voice_room_full' ? copy.full : copy.error)
        if (detail.phase === 'connecting') setError(null)
        if (detail.phase === 'left' || detail.phase === 'error') {
          setRoom(null)
          onReadingChangeRef.current?.(null)
        }
      }
    }
    window.addEventListener(NATIVE_VOICE_EVENT, onEvent)
    post({ type: 'native_voice_status_request', payload: { conversationId } })
    return () => {
      window.removeEventListener(NATIVE_VOICE_EVENT, onEvent)
      if (abandonTimerRef.current !== null) {
        window.clearTimeout(abandonTimerRef.current)
        abandonTimerRef.current = null
      }
      // Leaving the room screen stops the polling; a joined call keeps running.
      post({ type: 'native_voice_status_stop' })
    }
  }, [conversationId, copy.error, copy.full, viewerUserId])

  // An error line goes away by itself.
  useEffect(() => {
    if (!error) return
    const timer = setTimeout(() => setError(null), 4000)
    return () => clearTimeout(timer)
  }, [error])

  const live = !!call && call.participants.length > 0
  const connected = phase === 'connected'
  const liveCallId = live ? call?.id ?? null : null
  // Remember the call this phone is in, for the restart case above.
  useEffect(() => {
    if (connected && liveCallId) writeJoinedCallMarker(conversationId, liveCallId)
  }, [connected, conversationId, liveCallId])
  useEffect(() => {
    onAvailabilityChange?.({ live, joined, connected, callId: liveCallId })
  }, [live, joined, connected, liveCallId, onAvailabilityChange])

  const join = useCallback(() => {
    setStartPrompt(false)
    setFolded(false)
    joinVoiceTalk({ conversationId, title: conversationTitle, lang: myLang })
  }, [conversationId, conversationTitle, myLang])

  // A call this account is already in (it started it, or joined on another
  // phone) is never offered to it as someone else's.
  const viewerInCall = !!viewerUserId && !!call?.participants.some((p) => p.userId === viewerUserId)
  const incomingOffered = live && !joined && !viewerInCall && call?.id !== declinedCallId

  // `openSignal` is a counter, so this runs once per press (adjusting state
  // while rendering, not in an effect). While the incoming card is up it is
  // already asking whether to join: the button does not ask a second time.
  const [seenOpenSignal, setSeenOpenSignal] = useState(openSignal ?? 0)
  if ((openSignal ?? 0) !== seenOpenSignal) {
    setSeenOpenSignal(openSignal ?? 0)
    if (openSignal && !joined && !incomingOffered) setStartPrompt(true)
  }
  if (startPrompt && joined) setStartPrompt(false)

  // The button pressed during a call: a confirmation, never a silent leave.
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [seenLeaveSignal, setSeenLeaveSignal] = useState(leaveSignal ?? 0)
  if ((leaveSignal ?? 0) !== seenLeaveSignal) {
    setSeenLeaveSignal(leaveSignal ?? 0)
    if (leaveSignal && joined) setConfirmLeave(true)
  }
  if (confirmLeave && !joined) setConfirmLeave(false)

  // The native ad banner draws above the page: a dialog's dark veil cannot
  // cover it, and a card low on the screen would sit half under it. It is
  // hidden while any of the three (start/join, leave, incoming call) is up.
  const dialogOpen = startPrompt || confirmLeave || incomingOffered
  useNativeBannerSuppression(dialogOpen)

  // Decline the call that just started: it is not offered again by itself.
  const decline = useCallback(() => {
    if (call) setDeclinedCallId(call.id)
  }, [call, setDeclinedCallId])

  const leave = useCallback(() => {
    setConfirmLeave(false)
    onListenOnlyChange?.(false)
    // The panel goes away now, not when the app and the server have caught
    // up: this phone is out of the call, and out of its seat, at once.
    phaseRef.current = 'left'
    writeJoinedCallMarker(conversationId, null)
    setPhase('left')
    setRoom(null)
    if (call) {
      setDeclinedCallId(call.id)
      const localId = viewerUserId ?? room?.members.find((member) => member.isLocal)?.userId ?? null
      if (localId) setCall({ ...call, participants: call.participants.filter((p) => p.userId !== localId) })
    }
    post({ type: 'native_voice_close' })
  }, [call, conversationId, onListenOnlyChange, room, setDeclinedCallId, viewerUserId])

  // Seats: who is in the call (live LiveKit view when joined, else the API's).
  const seats = useMemo(() => {
    const people: VoiceTalkSeat[] = joined && room
      ? room.members.map((m) => ({
          key: m.identity,
          userId: m.userId,
          name: m.name,
          isLocal: m.isLocal,
          isSpeaking: m.isSpeaking,
          image: call?.participants.find((p) => p.userId === m.userId)?.image ?? null,
          lang: m.lang || (m.isLocal ? myLang : '') || call?.participants.find((p) => p.userId === m.userId)?.speechLanguage || '',
          // My own switch shows at once; the others' comes from the call.
          micOn: m.isLocal ? !listenOnly : m.micOn !== false,
        }))
      : (call?.participants ?? []).map((p) => ({
          key: p.userId,
          userId: p.userId,
          name: p.name || '',
          isLocal: false,
          isSpeaking: false,
          image: p.image,
          lang: p.speechLanguage || '',
          micOn: true,
        }))
    return people.slice(0, MAX_SEATS)
  }, [call, joined, listenOnly, myLang, room])

  // An open room's call has a stage: speakers on it, listeners below.
  const stageCopy = voiceStageCopy(props.uiLocale)
  const stage = useMemo(() => resolveVoiceStage(call, viewerUserId), [call, viewerUserId])
  const stageSeats = useMemo(
    () => (stage.enabled ? seats.filter((seat) => !stage.listenerIds.has(seat.userId)) : seats),
    [seats, stage],
  )
  const [stageNote, setStageNote] = useState<string | null>(null)
  useEffect(() => {
    if (!stageNote) return
    const timer = window.setTimeout(() => setStageNote(null), 4000)
    return () => window.clearTimeout(timer)
  }, [stageNote])
  const [stageBusy, setStageBusy] = useState(false)
  const stageAct = useCallback(async (action: 'raise' | 'lower' | 'invite' | 'remove' | 'step_down', userId?: string) => {
    if (stageBusy) return
    setStageBusy(true)
    try {
      const response = await fetch(buildClientApiPath(`/conversations/${encodeURIComponent(conversationId)}/voice/stage`), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, ...(userId ? { userId } : {}) }),
      })
      const body = await response.json().catch(() => null) as { call?: StatusCall; error?: string } | null
      if (response.ok && body?.call) setCall(body.call)
      else setStageNote(body?.error === 'stage_full' ? stageCopy.stageFull : stageCopy.failed)
    } catch {
      setStageNote(stageCopy.failed)
    }
    setStageBusy(false)
  }, [conversationId, stageBusy, stageCopy.failed, stageCopy.stageFull])

  // Put on the stage: the app joined with a listener's pass, so it joins
  // again for one that may send its voice. Taken off it: the mic goes off.
  const lastStageRoleRef = useRef<VoiceStageRole | null>(null)
  const stageRole = joined ? stage.myRole : null
  useEffect(() => {
    const change = voiceStageTransition(lastStageRoleRef.current, stageRole)
    lastStageRoleRef.current = stageRole
    if (change === 'promoted') {
      post({ type: 'native_voice_close' })
      // Not cleared when this effect runs again: closing the call changes the
      // role to "not in it", and the rejoin must still happen.
      if (stageRejoinTimerRef.current !== null) window.clearTimeout(stageRejoinTimerRef.current)
      stageRejoinTimerRef.current = window.setTimeout(() => {
        stageRejoinTimerRef.current = null
        setStageNote(stageCopy.onStageNow)
        onListenOnlyChange?.(false)
        joinVoiceTalk({ conversationId, title: conversationTitle, lang: myLangRef.current })
      }, 700)
    }
    if (change === 'demoted') onListenOnlyChange?.(true)
  }, [conversationId, conversationTitle, onListenOnlyChange, stageCopy.onStageNow, stageRole])
  const stageRejoinTimerRef = useRef<number | null>(null)
  useEffect(() => () => {
    if (stageRejoinTimerRef.current !== null) window.clearTimeout(stageRejoinTimerRef.current)
  }, [])

  // The same people, small, for the join dialog and the room's call message.
  const participantChips = useMemo<VoiceTalkParticipantChip[]>(
    () => (live ? seats.map((seat) => ({ userId: seat.userId, name: seat.name, image: seat.image, lang: seat.lang })) : []),
    [live, seats],
  )
  const lastChipsRef = useRef<VoiceTalkParticipantChip[] | null>(null)
  useEffect(() => {
    if (lastChipsRef.current && sameVoiceTalkParticipants(lastChipsRef.current, participantChips)) return
    lastChipsRef.current = participantChips
    onParticipantsChange?.(participantChips)
  }, [onParticipantsChange, participantChips])

  // Room members who are not in the call, shown small under the seats.
  const presence = useRoomPresence(conversationId)
  const [roomMembers, setRoomMembers] = useState<RoomMemberSummary[]>([])
  const roomVariant = props.variant === 'room'
  const panelShown = joined || !!error || roomVariant
  useEffect(() => {
    if (!panelShown || !conversationId) return
    let cancelled = false
    void fetch(buildClientApiPath(`/conversations/${encodeURIComponent(conversationId)}/members`), { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => { if (!cancelled) setRoomMembers(parseRoomMemberSummaries(body)) })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [conversationId, panelShown])
  const bystanders = useMemo(
    () => resolveVoiceTalkBystanders({ members: roomMembers, seatUserIds: seats.map((seat) => seat.userId), presence, viewerUserId }),
    [presence, roomMembers, seats, viewerUserId],
  )

  // The voice room's stage tells the room how tall it is: the chat starts below it.
  const roomStageRef = useRef<HTMLDivElement | null>(null)
  const onHeightChangeRef = useRef(props.onHeightChange)
  useEffect(() => { onHeightChangeRef.current = props.onHeightChange }, [props.onHeightChange])
  useEffect(() => {
    if (!roomVariant) return
    const element = roomStageRef.current
    if (!element) return
    const report = () => onHeightChangeRef.current?.(Math.round(element.getBoundingClientRect().height))
    report()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(report)
    observer?.observe(element)
    return () => {
      observer?.disconnect()
      onHeightChangeRef.current?.(0)
    }
  }, [roomVariant])

  const onDragEnd = useCallback((_: unknown, info: PanInfo) => {
    if (info.offset.y < -24 || info.velocity.y < -300) setFolded(true)
    else if (info.offset.y > 24 || info.velocity.y > 300) setFolded(false)
  }, [])

  const leaveDialog = confirmLeave ? (
    <div
      className="pointer-events-auto fixed inset-0 z-[60] flex items-center justify-center bg-black/35 px-8"
      data-qa="voice-talk-leave-confirm"
      onClick={() => setConfirmLeave(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={copy.leaveTitle}
        className="w-full max-w-[300px] rounded-2xl bg-white p-5 shadow-[0_18px_48px_rgba(15,23,42,0.22)]"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-center text-[1.02rem] font-semibold text-gray-900">{copy.leaveTitle}</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            data-qa="voice-talk-leave-cancel"
            onClick={() => setConfirmLeave(false)}
            className="h-11 rounded-xl bg-gray-100 text-[0.92rem] font-semibold text-gray-700 active:bg-gray-200"
          >
            {copy.cancel}
          </button>
          <button
            type="button"
            data-qa="voice-talk-leave-confirm-button"
            onClick={leave}
            className="h-11 rounded-xl bg-rose-500 text-[0.92rem] font-semibold text-white active:bg-rose-600"
          >
            {copy.leave}
          </button>
        </div>
      </div>
    </div>
  ) : null

  // Asked low on the screen, where the thumb already is (the button that
  // opened it sits at the bottom-left).
  const startDialog = startPrompt && !joined ? (
    <div
      className="pointer-events-auto fixed inset-0 z-[60] flex items-end justify-center bg-black/35 px-5 pb-[calc(env(safe-area-inset-bottom,0px)+96px)]"
      data-qa="voice-talk-start-confirm"
      onClick={() => setStartPrompt(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={live ? copy.joinTitle : copy.startTitle}
        className="w-full max-w-[340px] rounded-2xl bg-white p-5 shadow-[0_18px_48px_rgba(15,23,42,0.22)]"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-center text-[1.02rem] font-semibold text-gray-900">{live ? copy.joinTitle : copy.startTitle}</p>
        {live ? <VoiceTalkParticipantStrip participants={participantChips} className="mt-3" /> : null}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            type="button"
            data-qa="voice-talk-start-cancel"
            onClick={() => setStartPrompt(false)}
            className="h-12 rounded-xl bg-gray-100 text-[0.95rem] font-semibold text-gray-700 active:bg-gray-200"
          >
            {copy.cancel}
          </button>
          <button
            type="button"
            data-qa="voice-talk-start-confirm-button"
            onClick={join}
            className="inline-flex h-12 items-center justify-center gap-1.5 rounded-xl bg-emerald-500 text-[0.95rem] font-semibold text-white active:bg-emerald-600"
          >
            <Phone size={17} strokeWidth={2.3} /> {live ? copy.join : copy.startConfirm}
          </button>
        </div>
      </div>
    </div>
  ) : null

  // Someone started a call while this phone has the room open: a card low on
  // the screen offers it once. Declining (or closing) leaves the call's
  // message in the room, whose button still joins.
  const incoming = incomingOffered && !startPrompt
  // Who started it, never just whoever happens to be first in the list: the
  // starter may have dropped out, and may be this viewer (back after a restart).
  const startedByViewer = !!viewerUserId && call?.startedBy?.userId === viewerUserId
  const starterName = (
    call?.startedBy
      ? call.startedBy.name ?? call.participants.find((p) => p.userId === call.startedBy?.userId)?.name ?? ''
      : call?.participants[0]?.name ?? ''
  ).trim()
  const incomingTitle = startedByViewer ? copy.startedByMe : starterName ? copy.startedBy(starterName) : copy.startedBySomeone
  const incomingCard = incoming ? (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+96px)] z-[55] flex justify-center px-5"
      data-qa="voice-talk-incoming"
    >
      <div
        role="dialog"
        aria-label={incomingTitle}
        className="pointer-events-auto w-full max-w-[340px] rounded-2xl border border-emerald-100 bg-white p-4 shadow-[0_18px_48px_rgba(15,23,42,0.22)]"
      >
        <div className="flex items-center gap-2.5">
          <span className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
            <span aria-hidden="true" className="absolute inset-0 animate-ping rounded-full bg-emerald-400 opacity-40" />
            <Phone size={17} strokeWidth={2.3} className="relative" />
          </span>
          <p className="min-w-0 flex-1 text-[0.95rem] font-semibold leading-snug text-gray-900">
            {incomingTitle}
          </p>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <button
            type="button"
            data-qa="voice-talk-incoming-decline"
            onClick={decline}
            className="h-12 rounded-xl bg-gray-100 text-[0.95rem] font-semibold text-gray-700 active:bg-gray-200"
          >
            {copy.decline}
          </button>
          <button
            type="button"
            data-qa="voice-talk-incoming-join"
            onClick={join}
            className="h-12 rounded-xl bg-emerald-500 text-[0.95rem] font-semibold text-white active:bg-emerald-600"
          >
            {copy.join}
          </button>
        </div>
      </div>
    </div>
  ) : null

  // The voice room screen: the stage is the room, whether or not this phone
  // is in the call. Coming in is the stage's own button (no "join?" card).
  if (roomVariant) {
    const roomCopy = voiceRoomCopy(props.uiLocale)
    const onStage = stage.enabled ? stageSeats.length : seats.length
    return (
      <>
        {leaveDialog}
        {startDialog}
        <div ref={roomStageRef} className="pointer-events-none absolute inset-x-0 z-30" style={{ top: props.topOffset }}>
          <VoiceRoomStage
            labels={{
              status: phase === 'connecting' ? copy.connecting : (live || joined ? copy.live(onStage) : copy.idle),
              join: roomCopy.join,
              host: roomCopy.host,
              me: copy.me,
              emptySeat: roomCopy.emptySeat,
              micMuted: copy.micMuted,
              mic: roomCopy.mic,
              hand: roomCopy.hand,
              lowerHand: stageCopy.lowerHand,
              interpret: roomCopy.interpret,
              listen: roomCopy.listen,
              leave: roomCopy.leave,
              audience: roomCopy.audience(stage.listeners.length + bystanders.length),
              quiet: roomCopy.quiet,
              toStage: stageCopy.toStage,
              offStage: stageCopy.offStage,
              stepDown: stageCopy.stepDown,
              fold: copy.fold,
              open: copy.open,
            }}
            seats={stageSeats}
            seatCount={MAX_SEATS}
            hostUserId={call?.stage?.hostUserId ?? null}
            viewerUserId={viewerUserId}
            listeners={stage.listeners}
            bystanders={bystanders}
            joined={joined}
            connecting={phase === 'connecting'}
            stageEnabled={stage.enabled}
            isHost={stage.isHost}
            myRole={joined ? stage.myRole : null}
            myHandRaised={stage.myHandRaised}
            micOn={!listenOnly}
            interpretOn={interpretOn}
            listenOn={listenOn}
            earphonesConnected={props.earphonesConnected === true}
            busy={stageBusy}
            folded={folded}
            error={error}
            note={stageNote}
            onJoin={join}
            onLeave={leave}
            onToggleMic={() => onListenOnlyChange?.(!listenOnly)}
            onToggleHand={() => void stageAct(stage.myHandRaised ? 'lower' : 'raise')}
            onToggleInterpret={() => {
              // No Hash: the switch stays off and the "out of Hash" sheet opens.
              if (!interpretOn && !ensureCoinsForPaidFeature()) return
              onInterpretChange?.(!interpretOn)
            }}
            onToggleListen={() => onListenChange?.(!listenOn)}
            onInvite={(userId) => void stageAct('invite', userId)}
            onRemove={(userId) => void stageAct('remove', userId)}
            onStepDown={() => void stageAct('step_down')}
            onOpenProfile={onOpenProfile}
            onToggleFold={() => setFolded((value) => !value)}
          />
        </div>
      </>
    )
  }

  // The panel is the call this phone is in. Before joining there is nothing
  // to show under the top bar: starting and joining are the dialogs above.
  if (!joined && !error) {
    return <>{startDialog}{incomingCard}</>
  }

  // With a stage the count is the people on it (the seats); listeners are listed below.
  const count = stage.enabled ? stageSeats.length : joined && room ? room.members.length : call?.participants.length ?? 0

  return (
    <>
    {leaveDialog}
    {startDialog}
    {incomingCard}
    {/* Flat across the top (owner, 2026-11-25): a strip flush under the top bar, edge to edge, not a floating card. */}
    <div className="pointer-events-none absolute inset-x-0 z-30" style={{ top: props.topOffset }}>
      <motion.div
        layout
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={0.18}
        onDragEnd={onDragEnd}
        transition={{ type: 'spring', stiffness: 420, damping: 36 }}
        className="pointer-events-auto overflow-hidden border-b border-gray-100 bg-white"
        data-qa="voice-talk-panel"
      >
        {/* Top row: always visible; the folded state is only this row, and a
            tap anywhere on it unfolds the panel (not only on the chevron). */}
        <div
          data-qa="voice-talk-top-row"
          className={`flex items-center gap-2 px-3 py-2 ${folded ? 'cursor-pointer' : ''}`}
          onClick={folded ? () => setFolded(false) : undefined}
        >
          <span className="relative inline-flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <span className="min-w-0 flex-1 truncate text-[0.88rem] font-semibold text-gray-900">
            {phase === 'connecting' ? copy.connecting : (live || joined ? copy.live(count) : copy.idle)}
          </span>
          {joined && listenOnly ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[0.72rem] font-semibold text-gray-600">
              <MicOff size={12} strokeWidth={2.4} /> {copy.listenOnly}
            </span>
          ) : null}
          {folded ? (
            <div className="flex -space-x-2">
              {stageSeats.slice(0, 4).map((s) => (
                <span key={s.key} className={`inline-flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border-2 bg-amber-100 text-[0.65rem] font-bold text-amber-800 ${s.isSpeaking ? 'border-slate-400' : 'border-white'}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {s.image ? <img src={s.image} alt="" className="h-full w-full object-cover" /> : initial(s.name)}
                </span>
              ))}
            </div>
          ) : null}
          <button
            type="button"
            onClick={(event) => {
              // The row also unfolds on a tap: the chevron must not toggle twice.
              event.stopPropagation()
              setFolded((f) => !f)
            }}
            aria-label={folded ? copy.open : copy.fold}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
          >
            <ChevronUp size={18} strokeWidth={2.4} className={`transition-transform duration-300 ${folded ? 'rotate-180' : ''}`} />
          </button>
        </div>

        <AnimatePresence initial={false}>
          {!folded ? (
            <motion.div
              key="body"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              {/* The people in the call, then one open seat while there is
                  room: a 1:1 call is two faces, not two faces and six blanks.
                  The top row already says how many fit. */}
              <div className="flex flex-wrap justify-center gap-x-2 gap-y-2.5 px-3 pb-2 pt-1">
                {visibleVoiceTalkSeats(stageSeats, MAX_SEATS).map((s, i) => (
                  <div key={s?.key ?? `empty-${i}`} className="relative w-[calc(25%-6px)]">
                    <VoiceTalkSeatView
                      seat={s}
                      label={s ? (s.isLocal ? copy.me : s.name) : copy.empty}
                      mutedLabel={copy.micMuted}
                      onOpenProfile={onOpenProfile}
                    />
                    {/* The host takes a speaker off the stage. */}
                    {stage.enabled && stage.isHost && s && s.userId !== viewerUserId ? (
                      <button
                        type="button"
                        data-qa="voice-stage-remove"
                        aria-label={stageCopy.offStage}
                        title={stageCopy.offStage}
                        disabled={stageBusy}
                        onClick={() => void stageAct('remove', s.userId)}
                        className="absolute right-0 top-0 inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-white shadow disabled:opacity-50"
                      >
                        <ArrowDown size={12} strokeWidth={2.6} />
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>

              {error ? <p className="px-3 pb-2 text-[0.8rem] text-rose-600">{error}</p> : null}
              {stageNote ? <p data-qa="voice-stage-note" role="status" className="px-3 pb-2 text-center text-[0.8rem] text-emerald-700">{stageNote}</p> : null}
              {/* Someone the host put on the stage can step off it themselves. */}
              {stage.enabled && joined && stage.myRole === 'speaker' && !stage.isHost ? (
                <div className="flex justify-center px-3 pb-2">
                  <button
                    type="button"
                    data-qa="voice-stage-step-down"
                    disabled={stageBusy}
                    onClick={() => void stageAct('step_down')}
                    className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-[0.78rem] font-semibold text-gray-700 active:bg-gray-200 disabled:opacity-50"
                  >
                    <ArrowDown size={13} strokeWidth={2.4} />
                    {stageCopy.stepDown}
                  </button>
                </div>
              ) : null}

              {stage.enabled && stage.listeners.length > 0 ? (
                // The people who only listen. A raised hand shows on the face; the
                // host's tap puts that person on the stage.
                <div data-qa="voice-stage-listeners" className="border-t border-gray-100 px-3 pb-2 pt-2">
                  <p className="pb-1.5 text-[0.72rem] font-semibold text-gray-500">{stageCopy.listeners} {stage.listeners.length}</p>
                  <div className="flex flex-wrap gap-x-2.5 gap-y-2">
                    {stage.listeners.map((listener) => {
                      const face = (
                        <span className="relative inline-flex h-9 w-9 items-center justify-center overflow-visible">
                          <span className="inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-amber-100 text-[0.75rem] font-bold text-amber-800">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            {listener.image ? <img src={listener.image} alt="" className="h-full w-full object-cover" /> : initial(listener.name)}
                          </span>
                          {listener.handRaised ? (
                            <span data-qa="voice-stage-hand" aria-label={stageCopy.raiseHand} className="absolute -right-1 -top-1 inline-flex h-4.5 w-4.5 items-center justify-center rounded-full bg-amber-400 p-0.5 text-white shadow">
                              <Hand size={11} strokeWidth={2.6} />
                            </span>
                          ) : null}
                          {stage.isHost ? (
                            <span aria-hidden="true" className="absolute -bottom-1 -right-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white shadow">
                              <ArrowUp size={10} strokeWidth={2.8} />
                            </span>
                          ) : null}
                        </span>
                      )
                      return stage.isHost ? (
                        <button
                          key={listener.userId}
                          type="button"
                          data-qa="voice-stage-invite"
                          aria-label={`${stageCopy.toStage}: ${listener.name || ''}`}
                          title={stageCopy.toStage}
                          disabled={stageBusy}
                          onClick={() => void stageAct('invite', listener.userId)}
                          className="disabled:opacity-50"
                        >
                          {face}
                        </button>
                      ) : (
                        <button
                          key={listener.userId}
                          type="button"
                          data-qa="voice-stage-listener"
                          aria-label={listener.name || stageCopy.listeners}
                          onClick={() => {
                            if (listener.userId !== viewerUserId) onOpenProfile?.(listener.userId)
                          }}
                        >
                          {face}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : null}

              {bystanders.length > 0 ? (
                // Everyone in the room who is not in the call: a small plain
                // circle each, dimmed while they do not have the room open.
                <div data-qa="voice-talk-bystanders" className="flex items-center gap-1.5 overflow-x-auto px-3 pb-2">
                  {bystanders.map((member) => (
                    <span
                      key={member.id}
                      title={member.name || undefined}
                      data-qa="voice-talk-bystander"
                      data-viewing={member.viewing ? 'true' : 'false'}
                      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-amber-100 text-[0.6rem] font-bold text-amber-800 transition-opacity duration-300 ${
                        member.viewing ? '' : 'opacity-35'
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {member.image ? <img src={member.image} alt="" className="h-full w-full object-cover" /> : initial(member.name)}
                    </span>
                  ))}
                </div>
              ) : null}

              {joined ? (
                // Four round buttons, icons only (color says on or off), with
                // room between them so a thumb does not hit the neighbor.
                <div className="flex items-center justify-center gap-4 border-t border-gray-100 px-3 py-3">
                  {/* A listener asks for the stage here; a speaker has the mic button. */}
                  {stage.enabled && stage.myRole === 'listener' ? (
                    <button
                      type="button"
                      data-qa="voice-stage-raise-hand"
                      aria-pressed={stage.myHandRaised}
                      aria-label={stage.myHandRaised ? stageCopy.lowerHand : stageCopy.raiseHand}
                      title={stage.myHandRaised ? stageCopy.lowerHand : stageCopy.raiseHand}
                      disabled={stageBusy}
                      onClick={() => void stageAct(stage.myHandRaised ? 'lower' : 'raise')}
                      className={`inline-flex h-12 w-16 items-center justify-center rounded-full transition-colors disabled:opacity-50 ${
                        stage.myHandRaised ? 'bg-amber-400 text-white shadow-sm active:bg-amber-500' : 'bg-gray-100 text-gray-500 active:bg-gray-200'
                      }`}
                    >
                      <Hand size={22} />
                    </button>
                  ) : (
                  <button
                    type="button"
                    data-qa="voice-talk-mic-toggle"
                    aria-pressed={!listenOnly}
                    aria-label={listenOnly ? copy.micOffState : copy.micOnState}
                    title={listenOnly ? copy.micOffState : copy.micOnState}
                    onClick={() => onListenOnlyChange?.(!listenOnly)}
                    className={`inline-flex h-12 w-16 items-center justify-center rounded-full transition-colors ${
                      listenOnly ? 'bg-gray-100 text-gray-400 active:bg-gray-200' : 'bg-red-500 text-white shadow-sm active:bg-red-600'
                    }`}
                  >
                    {listenOnly ? <MicOff size={22} /> : <Mic size={22} />}
                  </button>
                  )}
                  {/* Interpretation: captions of what the others say. */}
                  <button
                    type="button"
                    data-qa="voice-talk-interpret-toggle"
                    aria-pressed={interpretOn}
                    aria-label={interpretOn ? copy.interpretOnState : copy.interpretOffState}
                    title={interpretOn ? copy.interpretOnState : copy.interpretOffState}
                    onClick={() => {
                      // No Hash: the switch stays off and the "out of Hash" sheet opens.
                      if (!interpretOn && !ensureCoinsForPaidFeature()) return
                      onInterpretChange?.(!interpretOn)
                    }}
                    className={`inline-flex h-12 w-16 items-center justify-center rounded-full transition-colors ${
                      interpretOn ? 'bg-emerald-500 text-white shadow-sm active:bg-emerald-600' : 'bg-gray-100 text-gray-400 active:bg-gray-200'
                    }`}
                  >
                    <Languages size={22} />
                  </button>
                  {/* The translations read aloud (speaker, or earphones when in). Needs interpretation. */}
                  <button
                    type="button"
                    data-qa="voice-talk-listen-toggle"
                    aria-pressed={interpretOn && listenOn}
                    aria-label={listenOn ? copy.listenOnState : copy.listenOffState}
                    title={listenOn ? copy.listenOnState : copy.listenOffState}
                    disabled={!interpretOn}
                    onClick={() => {
                      onListenChange?.(!listenOn)
                    }}
                    className={`inline-flex h-12 w-16 items-center justify-center rounded-full transition-colors disabled:opacity-40 ${
                      interpretOn && listenOn ? 'bg-amber-400 text-white shadow-sm active:bg-amber-500' : 'bg-gray-100 text-gray-400 active:bg-gray-200'
                    }`}
                  >
                    {props.earphonesConnected
                      ? <Headphones size={22} />
                      : listenOn ? <Volume2 size={22} /> : <VolumeX size={22} />}
                  </button>
                  <button
                    type="button"
                    data-qa="voice-talk-leave"
                    aria-label={copy.leave}
                    title={copy.leave}
                    // Inside the panel the button is unmistakable: it leaves at
                    // once. Only the room's phone button asks first.
                    onClick={leave}
                    // Plain gray: red is the mic's "on", and two red buttons both read as warnings.
                    className="inline-flex h-12 w-16 items-center justify-center rounded-full bg-gray-100 text-gray-700 active:bg-gray-200"
                  >
                    <PhoneOff size={22} />
                  </button>
                </div>
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.div>
    </div>
    </>
  )
}


/**
 * What a voice talk switch costs, in a sentence. Null when there is nothing to say.
 */
export function voiceTalkCostTip(input: {
  kind: 'interpret' | 'listen'
  listenOn: boolean
  rates: { sttCoinsPerMinute: number; ttsCoinsPerAudioMinute?: number } | null | undefined
  copy: { interpretTip: string; listenTip: string }
}): string | null {
  const stt = Math.ceil(input.rates?.sttCoinsPerMinute ?? 0)
  const tts = Math.ceil(input.rates?.ttsCoinsPerAudioMinute ?? 0)
  const listen = tts > 0 ? input.copy.listenTip.replace('{coins}', String(tts)) : ''
  if (input.kind === 'listen') return listen || null
  if (stt <= 0) return null
  const interpret = input.copy.interpretTip.replace('{coins}', String(stt))
  // Read-aloud is on by default, so its cost comes with the first tip.
  return input.listenOn && listen ? `${interpret} ${listen}` : interpret
}

/** The seats to draw: everyone in the call, then one open seat while the call is not full. */
export function visibleVoiceTalkSeats<T>(seats: readonly T[], maxSeats: number): Array<T | null> {
  const people = seats.slice(0, maxSeats)
  return people.length < maxSeats ? [...people, null] : people
}

export type RoomMemberSummary = { id: string; name: string | null; image: string | null }

/** The room's members from the members API (`{ members: [{ id, name, image }] }`). */
export function parseRoomMemberSummaries(body: unknown): RoomMemberSummary[] {
  const list = (body as { members?: unknown } | null)?.members
  if (!Array.isArray(list)) return []
  const out: RoomMemberSummary[] = []
  for (const raw of list) {
    const record = raw as { id?: unknown; name?: unknown; image?: unknown } | null
    if (!record || typeof record.id !== 'string' || !record.id) continue
    out.push({
      id: record.id,
      name: typeof record.name === 'string' && record.name.trim() ? record.name.trim() : null,
      image: typeof record.image === 'string' && record.image ? record.image : null,
    })
  }
  return out
}

/**
 * Room members who are not in the call, those with the room open first.
 * `viewing` is whether they have the room open right now: the viewer always
 * does, and while the server has not reported yet (presence null) nobody is
 * shown as away.
 */
export function resolveVoiceTalkBystanders(input: {
  members: readonly RoomMemberSummary[]
  seatUserIds: readonly string[]
  presence: readonly string[] | null
  viewerUserId: string | null
}): Array<RoomMemberSummary & { viewing: boolean }> {
  const seated = new Set(input.seatUserIds)
  const here = input.presence ? new Set(input.presence) : null
  return input.members
    .filter((member) => !seated.has(member.id))
    .map((member) => ({ ...member, viewing: member.id === input.viewerUserId || !here || here.has(member.id) }))
    .sort((left, right) => Number(right.viewing) - Number(left.viewing))
}

type VoiceTalkSeat = {
  key: string
  userId: string
  name: string
  isLocal: boolean
  isSpeaking: boolean
  image: string | null
  /** Speech language, for the flag. Empty = no flag. */
  lang: string
  /** False = listen only: a mute icon covers the avatar. */
  micOn: boolean
}

/**
 * One seat (the open one is a dashed circle with a plus): a round avatar with the member's language flag at its
 * bottom-left, a mute icon over its middle while their mic is off, and a
 * soft ripple around it while they speak. Tapping it opens their profile.
 */
export function VoiceTalkSeatView(props: {
  seat: VoiceTalkSeat | null
  label: string
  mutedLabel: string
  onOpenProfile?: (userId: string) => void
}) {
  const { seat, label, mutedLabel, onOpenProfile } = props
  const speaking = !!seat && seat.isSpeaking && seat.micOn
  const face = (
    <span
      className={`relative inline-flex h-12 w-12 items-center justify-center overflow-hidden rounded-full text-[0.95rem] font-bold ${
        seat ? 'bg-amber-100 text-amber-800' : 'border border-dashed border-gray-300 bg-gray-50 text-gray-300'
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {seat ? (seat.image ? <img src={seat.image} alt="" className="h-full w-full object-cover" /> : initial(seat.name)) : <Plus size={18} strokeWidth={2.2} aria-hidden="true" />}
      {seat && !seat.micOn ? (
        <span
          data-qa="voice-talk-seat-muted"
          aria-label={mutedLabel}
          className="absolute inset-0 flex items-center justify-center bg-black/40 text-white"
        >
          <MicOff size={20} strokeWidth={2.4} />
        </span>
      ) : null}
    </span>
  )
  return (
    <div className="flex min-w-0 flex-col items-center gap-1" data-qa="voice-talk-seat">
      <span className="relative inline-flex h-12 w-12 items-center justify-center">
        {speaking ? (
          <>
            {/* Two translucent rings spreading out in turn, over a faint steady glow.
                Neutral gray: a tinted ring read as a stain around the photo. */}
            <span aria-hidden="true" data-qa="voice-talk-seat-speaking" className="mingle-voice-ripple pointer-events-none absolute inset-0 rounded-full bg-slate-500/35" />
            <span aria-hidden="true" className="mingle-voice-ripple mingle-voice-ripple-late pointer-events-none absolute inset-0 rounded-full bg-slate-500/35" />
            <span aria-hidden="true" className="pointer-events-none absolute -inset-[3px] rounded-full bg-slate-400/35" />
          </>
        ) : null}
        {seat && onOpenProfile ? (
          <button
            type="button"
            data-qa="voice-talk-seat-profile"
            aria-label={label}
            onClick={() => onOpenProfile(seat.userId)}
            className="relative rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
          >
            {face}
          </button>
        ) : (
          <span className="relative">{face}</span>
        )}
        {seat?.lang ? (
          <span
            aria-hidden="true"
            data-qa="voice-talk-seat-flag"
            className="pointer-events-none absolute -bottom-[2px] -left-[2px] flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-white px-[2px] ring-1 ring-gray-200"
          >
            <LanguageFlag language={seat.lang} className="text-[11px] leading-none" />
          </span>
        ) : null}
      </span>
      <span className="w-full truncate text-center text-[0.7rem] font-medium text-gray-600">{label}</span>
    </div>
  )
}

export function VoiceTalkButton(props: { uiLocale: string; active: boolean; onPress: () => void; sizePx?: number; className?: string }) {
  const copy = voiceTalkCopy(props.uiLocale)
  const sizePx = props.sizePx ?? 44
  return (
    <button
      data-qa="live-demo-voice-talk-button"
      type="button"
      onPointerDown={(event) => event.preventDefault()}
      onClick={props.onPress}
      aria-label={copy.start}
      aria-pressed={props.active}
      title={copy.start}
      className={`relative inline-flex shrink-0 items-center justify-center transition-all duration-200 active:scale-95 ${
        props.active ? 'text-emerald-500' : 'text-gray-500 hover:text-gray-700'
      } ${props.className ?? ''}`}
      style={{ width: `${sizePx}px`, height: `${sizePx}px` }}
    >
      {/* Invisible tap area beyond the drawn button: toward the screen edge,
          above and below, never over the button on its right. */}
      <span aria-hidden="true" data-qa="voice-talk-button-hit-area" className="absolute -bottom-3 -left-4 -top-3 right-0" />
      <Phone size={18} strokeWidth={2.15} />
      {props.active ? (
        <span aria-hidden="true" className="pointer-events-none absolute right-[10px] top-[10px] h-[7px] w-[7px] rounded-full bg-emerald-500 ring-2 ring-white" />
      ) : null}
    </button>
  )
}

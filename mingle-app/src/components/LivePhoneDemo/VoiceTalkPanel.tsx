'use client'

// Group voice talk inside the chat room (KakaoTalk style: the room stays the
// same room, voice is switched on and off). A panel slides down from under the
// top bar with up to 8 seats; drag it up (or tap the handle) to fold it into a
// slim bar.
//
// The panel has no text of its own and no mic button. Voice talk and the room's
// speech-to-text are one mic: the room's Start/Stop button owns it, the call
// only adds sending the voice. What people say shows as the room's messages.
//
// The call itself runs in the native app (LiveKit audio). This panel only
// draws it and sends button presses over the RN bridge (see
// rn/src/voice/voiceBridge.ts for the message shapes).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion, type PanInfo } from 'framer-motion'
import { ChevronUp, PhoneOff, Phone } from 'lucide-react'

export const NATIVE_VOICE_EVENT = 'mingle:native-voice'
const MAX_SEATS = 8

type CallParticipant = { userId: string; name: string | null; image: string | null }
type StatusCall = { id: string; participants: CallParticipant[]; maxParticipants: number } | null
type RoomMember = { identity: string; userId: string; name: string; isLocal: boolean; isSpeaking: boolean }
type RoomSnapshot = {
  status: string
  /** Language the app joined with; its translation lane is the one we hear. */
  myLang?: string
  members: RoomMember[]
  micOn: boolean
  micAvailable: boolean
  interpretOn: boolean
}
type Phase = 'idle' | 'connecting' | 'connected' | 'left' | 'error'

type VoiceEvent =
  | { type: 'state'; phase: Phase; conversationId: string | null; errorKind?: string }
  | { type: 'status'; conversationId: string; call: StatusCall }
  | { type: 'room'; conversationId: string; snapshot: RoomSnapshot }

const COPY = {
  ko: {
    start: '보이스톡',
    join: '참여',
    decline: '거절',
    close: '닫기',
    idle: '보이스톡 · 아무도 없어요',
    live: (n: number) => `보이스톡 · ${n}/${MAX_SEATS}`,
    connecting: '연결 중…',
    leave: '나가기',
    me: '나',
    empty: '빈 자리',
    full: '자리가 다 찼어요 (최대 8명)',
    error: '연결하지 못했어요',
    fold: '접기',
    open: '펼치기',
  },
  en: {
    start: 'Voice talk',
    join: 'Join',
    decline: 'Decline',
    close: 'Close',
    idle: 'Voice talk · nobody yet',
    live: (n: number) => `Voice talk · ${n}/${MAX_SEATS}`,
    connecting: 'Connecting…',
    leave: 'Leave',
    me: 'Me',
    empty: 'Empty',
    full: 'The room is full (max 8)',
    error: 'Could not connect',
    fold: 'Fold',
    open: 'Open',
  },
}

type NativeBridge = { postMessage: (data: string) => void }

function bridge(): NativeBridge | null {
  if (typeof window === 'undefined') return null
  const b = (window as unknown as { ReactNativeWebView?: NativeBridge }).ReactNativeWebView
  return b && typeof b.postMessage === 'function' ? b : null
}

function post(command: Record<string, unknown>) {
  bridge()?.postMessage(JSON.stringify(command))
}

export function isVoiceTalkAvailable(): boolean {
  return bridge() !== null
}

function initial(name: string | null | undefined): string {
  const trimmed = (name || '').trim()
  return trimmed ? Array.from(trimmed)[0].toUpperCase() : '?'
}

/** The room's Start/Stop button drives the call's mic through this. */
export function setVoiceTalkMic(on: boolean) {
  post({ type: 'native_voice_set', payload: { mic: on } })
}

export type VoiceTalkPanelProps = {
  conversationId: string
  conversationTitle?: string
  uiLocale: string
  /** The language this user speaks (STT source) and listens in. */
  myLang: string
  /** Pixels from the top of the room screen to the bottom of the top bar. */
  topOffset: string
  /** Lets the room header show a start button; `connected` is a call this phone is in. */
  onAvailabilityChange?: (state: { live: boolean; joined: boolean; connected: boolean }) => void
  /** Bumped by the room's voice talk button: shows the panel (joining is the panel's Join button). */
  openSignal?: number
}

export default function VoiceTalkPanel(props: VoiceTalkPanelProps) {
  const { conversationId, conversationTitle, myLang, openSignal, onAvailabilityChange } = props
  const copy = (props.uiLocale || '').toLowerCase().startsWith('ko') ? COPY.ko : COPY.en
  const [call, setCall] = useState<StatusCall>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [room, setRoom] = useState<RoomSnapshot | null>(null)
  const [folded, setFolded] = useState(false)
  // Shown by the voice talk button before joining.
  const [opened, setOpened] = useState(false)
  // A call this phone declined stays hidden until a new call starts.
  const [declinedCallId, setDeclinedCallId] = useState<string | null>(null)

  const joined = phase === 'connecting' || phase === 'connected'

  useEffect(() => {
    if (!conversationId || !bridge()) return
    const onEvent = (event: Event) => {
      const detail = (event as CustomEvent<VoiceEvent>).detail
      if (!detail || ('conversationId' in detail && detail.conversationId && detail.conversationId !== conversationId)) return
      if (detail.type === 'status') setCall(detail.call)
      else if (detail.type === 'room') setRoom(detail.snapshot)
      else if (detail.type === 'state') {
        setPhase(detail.phase)
        if (detail.phase === 'error') setError(detail.errorKind === 'voice_room_full' ? copy.full : copy.error)
        if (detail.phase === 'connecting') setError(null)
        if (detail.phase === 'left' || detail.phase === 'error') setRoom(null)
      }
    }
    window.addEventListener(NATIVE_VOICE_EVENT, onEvent)
    post({ type: 'native_voice_status_request', payload: { conversationId } })
    return () => {
      window.removeEventListener(NATIVE_VOICE_EVENT, onEvent)
      // Leaving the room screen stops the polling; a joined call keeps running.
      post({ type: 'native_voice_status_stop' })
    }
  }, [conversationId, copy.error, copy.full])

  // An error line goes away by itself.
  useEffect(() => {
    if (!error) return
    const timer = setTimeout(() => setError(null), 4000)
    return () => clearTimeout(timer)
  }, [error])

  const live = !!call && call.participants.length > 0
  const connected = phase === 'connected'
  useEffect(() => {
    onAvailabilityChange?.({ live, joined, connected })
  }, [live, joined, connected, onAvailabilityChange])

  const join = useCallback(() => {
    setFolded(false)
    post({ type: 'native_voice_open', payload: { conversationId, title: conversationTitle, lang: myLang, interpret: false } })
  }, [conversationId, conversationTitle, myLang])

  // The button only shows the panel; `openSignal` is a counter, so this runs
  // once per press (adjusting state while rendering, not in an effect).
  const [seenOpenSignal, setSeenOpenSignal] = useState(openSignal ?? 0)
  if ((openSignal ?? 0) !== seenOpenSignal) {
    setSeenOpenSignal(openSignal ?? 0)
    if (openSignal) {
      setOpened(true)
      setFolded(false)
      setDeclinedCallId(null)
    }
  }

  // Decline an incoming call, or close the panel opened by the button.
  const dismiss = useCallback(() => {
    setOpened(false)
    if (call) setDeclinedCallId(call.id)
  }, [call])

  const leave = useCallback(() => {
    setOpened(false)
    post({ type: 'native_voice_close' })
  }, [])

  // Seats: who is in the call (live LiveKit view when joined, else the API's).
  const seats = useMemo(() => {
    const people: Array<{ key: string; name: string; isLocal: boolean; isSpeaking: boolean; image: string | null }> = joined && room
      ? room.members.map((m) => ({ key: m.identity, name: m.name, isLocal: m.isLocal, isSpeaking: m.isSpeaking, image: call?.participants.find((p) => p.userId === m.userId)?.image ?? null }))
      : (call?.participants ?? []).map((p) => ({ key: p.userId, name: p.name || '', isLocal: false, isSpeaking: false, image: p.image }))
    return people.slice(0, MAX_SEATS)
  }, [call, joined, room])

  const onDragEnd = useCallback((_: unknown, info: PanInfo) => {
    if (info.offset.y < -24 || info.velocity.y < -300) setFolded(true)
    else if (info.offset.y > 24 || info.velocity.y > 300) setFolded(false)
  }, [])

  const incoming = live && call?.id !== declinedCallId
  if (!joined && !error && !opened && !incoming) return null

  const count = joined && room ? room.members.length : call?.participants.length ?? 0

  return (
    <div className="pointer-events-none absolute inset-x-0 z-30 px-2" style={{ top: props.topOffset }}>
      <motion.div
        layout
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={0.18}
        onDragEnd={onDragEnd}
        transition={{ type: 'spring', stiffness: 420, damping: 36 }}
        className="pointer-events-auto mt-1 overflow-hidden rounded-2xl border border-gray-100 bg-white/95 shadow-[0_10px_28px_rgba(15,23,42,0.12)] backdrop-blur-sm"
        data-qa="voice-talk-panel"
      >
        {/* Top row: always visible; the folded state is only this row. */}
        <div className="flex items-center gap-2 px-3 py-2">
          <span className="relative inline-flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <span className="min-w-0 flex-1 truncate text-[0.88rem] font-semibold text-gray-900">
            {phase === 'connecting' ? copy.connecting : (live || joined ? copy.live(count) : copy.idle)}
          </span>
          {folded ? (
            <div className="flex -space-x-2">
              {seats.slice(0, 4).map((s) => (
                <span key={s.key} className={`inline-flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border-2 bg-amber-100 text-[0.65rem] font-bold text-amber-800 ${s.isSpeaking ? 'border-amber-400' : 'border-white'}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {s.image ? <img src={s.image} alt="" className="h-full w-full object-cover" /> : initial(s.name)}
                </span>
              ))}
            </div>
          ) : null}
          {!joined ? (
            <>
              <button
                type="button"
                data-qa="voice-talk-dismiss"
                onClick={dismiss}
                className="rounded-full bg-gray-100 px-3 py-1 text-[0.8rem] font-semibold text-gray-700 active:bg-gray-200"
              >
                {live ? copy.decline : copy.close}
              </button>
              <button
                type="button"
                data-qa="voice-talk-join"
                onClick={join}
                className="rounded-full bg-emerald-500 px-3 py-1 text-[0.8rem] font-semibold text-white active:bg-emerald-600"
              >
                {copy.join}
              </button>
            </>
          ) : null}
          <button
            type="button"
            onClick={() => setFolded((f) => !f)}
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
              <div className="grid grid-cols-4 gap-x-2 gap-y-2.5 px-3 pb-2 pt-1">
                {Array.from({ length: MAX_SEATS }, (_, i) => seats[i] ?? null).map((s, i) => (
                  <div key={s?.key ?? `empty-${i}`} className="flex min-w-0 flex-col items-center gap-1">
                    <span
                      className={`relative inline-flex h-12 w-12 items-center justify-center overflow-hidden rounded-full text-[0.95rem] font-bold transition-shadow duration-150 ${
                        s ? 'bg-amber-100 text-amber-800' : 'border border-dashed border-gray-300 bg-gray-50 text-gray-300'
                      } ${s?.isSpeaking ? 'ring-[3px] ring-amber-400 ring-offset-2 ring-offset-white' : ''}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {s ? (s.image ? <img src={s.image} alt="" className="h-full w-full object-cover" /> : initial(s.name)) : ''}
                    </span>
                    <span className="w-full truncate text-center text-[0.7rem] font-medium text-gray-600">
                      {s ? (s.isLocal ? copy.me : s.name) : copy.empty}
                    </span>
                  </div>
                ))}
              </div>

              {error ? <p className="px-3 pb-2 text-[0.8rem] text-rose-600">{error}</p> : null}

              {joined ? (
                <div className="flex items-center justify-center gap-2 border-t border-gray-100 px-3 py-2">
                  <button type="button" onClick={leave} className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1.5 text-[0.8rem] font-semibold text-rose-600">
                    <PhoneOff size={15} /> {copy.leave}
                  </button>
                </div>
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}

export function VoiceTalkButton(props: { uiLocale: string; active: boolean; onPress: () => void; sizePx?: number; className?: string }) {
  const copy = (props.uiLocale || '').toLowerCase().startsWith('ko') ? COPY.ko : COPY.en
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
      <Phone size={18} strokeWidth={2.15} />
      {props.active ? (
        <span aria-hidden="true" className="pointer-events-none absolute right-[10px] top-[10px] h-[7px] w-[7px] rounded-full bg-emerald-500 ring-2 ring-white" />
      ) : null}
    </button>
  )
}

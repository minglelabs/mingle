'use client'

// Group voice talk inside the chat room (KakaoTalk style: the room stays the
// same room, voice is switched on and off). A panel slides down from under the
// top bar with up to 8 seats; drag it up (or tap the handle) to fold it into a
// slim bar. What people say shows as plain text lines.
//
// The call itself runs in the native app (LiveKit audio). This panel only
// draws it and sends button presses over the RN bridge (see
// rn/src/voice/voiceBridge.ts for the message shapes).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion, type PanInfo } from 'framer-motion'
import { ChevronUp, Mic, MicOff, Languages, PhoneOff, Phone } from 'lucide-react'

export const NATIVE_VOICE_EVENT = 'mingle:native-voice'
const MAX_SEATS = 8

type CallParticipant = { userId: string; name: string | null; image: string | null }
type StatusCall = { id: string; participants: CallParticipant[]; maxParticipants: number } | null
type RoomMember = { identity: string; userId: string; name: string; isLocal: boolean; isSpeaking: boolean }
type RoomCaption = { id: string; speakerName: string; original: string; isPartial: boolean; isEcho: boolean; translations: Record<string, string> }
type RoomSnapshot = {
  status: string
  members: RoomMember[]
  micOn: boolean
  micAvailable: boolean
  interpretOn: boolean
  captions: RoomCaption[]
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
    live: (n: number) => `보이스톡 · ${n}/${MAX_SEATS}`,
    connecting: '연결 중…',
    mic: '마이크',
    interpret: '통역',
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
    live: (n: number) => `Voice talk · ${n}/${MAX_SEATS}`,
    connecting: 'Connecting…',
    mic: 'Mic',
    interpret: 'Interpret',
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

// Plain text lines: original, then my language's translation when there is one.
function captionLines(captions: RoomCaption[], myLang: string, limit = 3): Array<{ id: string; who: string; text: string; partial: boolean }> {
  return captions
    .filter((c) => !c.isEcho && (c.original || '').trim())
    .slice(0, limit)
    .map((c) => {
      const translated = c.translations?.[myLang]
      return { id: c.id, who: c.speakerName, text: translated ? `${translated}  (${c.original})` : c.original, partial: c.isPartial }
    })
    .reverse()
}

export type VoiceTalkPanelProps = {
  conversationId: string
  conversationTitle?: string
  uiLocale: string
  /** The language this user speaks (STT source) and listens in. */
  myLang: string
  /** Pixels from the top of the room screen to the bottom of the top bar. */
  topOffset: string
  /** Lets the room header show a start button. */
  onAvailabilityChange?: (state: { live: boolean; joined: boolean }) => void
  /** Bumped by the header button to start/join. */
  startSignal?: number
}

export default function VoiceTalkPanel(props: VoiceTalkPanelProps) {
  const { conversationId, conversationTitle, myLang, startSignal, onAvailabilityChange } = props
  const copy = (props.uiLocale || '').toLowerCase().startsWith('ko') ? COPY.ko : COPY.en
  const [call, setCall] = useState<StatusCall>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [room, setRoom] = useState<RoomSnapshot | null>(null)
  const [folded, setFolded] = useState(false)

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
    return () => window.removeEventListener(NATIVE_VOICE_EVENT, onEvent)
  }, [conversationId, copy.error, copy.full])

  const live = !!call && call.participants.length > 0
  useEffect(() => {
    onAvailabilityChange?.({ live, joined })
  }, [live, joined, onAvailabilityChange])

  const join = useCallback(() => {
    setFolded(false)
    post({ type: 'native_voice_open', payload: { conversationId, title: conversationTitle, lang: myLang, interpret: true } })
  }, [conversationId, conversationTitle, myLang])

  useEffect(() => {
    if (startSignal) join()
  }, [startSignal, join])

  const leave = useCallback(() => post({ type: 'native_voice_close' }), [])
  const toggleMic = useCallback(() => room && post({ type: 'native_voice_set', payload: { mic: !room.micOn } }), [room])
  const toggleInterpret = useCallback(() => room && post({ type: 'native_voice_set', payload: { interpret: !room.interpretOn } }), [room])

  // Seats: who is in the call (live LiveKit view when joined, else the API's).
  const seats = useMemo(() => {
    const people: Array<{ key: string; name: string; isLocal: boolean; isSpeaking: boolean; image: string | null }> = joined && room
      ? room.members.map((m) => ({ key: m.identity, name: m.name, isLocal: m.isLocal, isSpeaking: m.isSpeaking, image: call?.participants.find((p) => p.userId === m.userId)?.image ?? null }))
      : (call?.participants ?? []).map((p) => ({ key: p.userId, name: p.name || '', isLocal: false, isSpeaking: false, image: p.image }))
    return people.slice(0, MAX_SEATS)
  }, [call, joined, room])

  const lines = useMemo(() => (room ? captionLines(room.captions, myLang) : []), [room, myLang])

  const onDragEnd = useCallback((_: unknown, info: PanInfo) => {
    if (info.offset.y < -24 || info.velocity.y < -300) setFolded(true)
    else if (info.offset.y > 24 || info.velocity.y > 300) setFolded(false)
  }, [])

  if (!live && !joined && !error) return null

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
            {phase === 'connecting' ? copy.connecting : copy.live(count)}
          </span>
          {folded ? (
            <div className="flex -space-x-2">
              {seats.slice(0, 4).map((s) => (
                <span key={s.key} className={`inline-flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border-2 bg-amber-100 text-[0.65rem] font-bold text-amber-800 ${s.isSpeaking ? 'border-amber-400' : 'border-white'}`}>
                  {s.image ? <img src={s.image} alt="" className="h-full w-full object-cover" /> : initial(s.name)}
                </span>
              ))}
            </div>
          ) : null}
          {!joined ? (
            <button type="button" onClick={join} className="rounded-full bg-amber-500 px-3 py-1 text-[0.8rem] font-semibold text-white active:bg-amber-600">
              {copy.join}
            </button>
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
                      {s ? (s.image ? <img src={s.image} alt="" className="h-full w-full object-cover" /> : initial(s.name)) : ''}
                    </span>
                    <span className="w-full truncate text-center text-[0.7rem] font-medium text-gray-600">
                      {s ? (s.isLocal ? copy.me : s.name) : copy.empty}
                    </span>
                  </div>
                ))}
              </div>

              {lines.length ? (
                <div className="space-y-0.5 border-t border-gray-100 px-3 py-2 text-[0.82rem] leading-snug text-gray-700">
                  {lines.map((line) => (
                    <p key={line.id} className={line.partial ? 'text-gray-400' : ''}>
                      <span className="font-semibold text-gray-900">{line.who}</span> {line.text}
                    </p>
                  ))}
                </div>
              ) : null}

              {error ? <p className="px-3 pb-2 text-[0.8rem] text-rose-600">{error}</p> : null}

              {joined ? (
                <div className="flex items-center justify-center gap-2 border-t border-gray-100 px-3 py-2">
                  <button
                    type="button"
                    onClick={toggleMic}
                    disabled={!room?.micAvailable}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.8rem] font-semibold ${room?.micOn ? 'bg-gray-100 text-gray-800' : 'bg-gray-800 text-white'} disabled:opacity-40`}
                  >
                    {room?.micOn ? <Mic size={15} /> : <MicOff size={15} />} {copy.mic}
                  </button>
                  <button
                    type="button"
                    onClick={toggleInterpret}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.8rem] font-semibold ${room?.interpretOn ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-800'}`}
                  >
                    <Languages size={15} /> {copy.interpret} {room?.interpretOn ? 'ON' : 'OFF'}
                  </button>
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

export function VoiceTalkHeaderButton(props: { uiLocale: string; active: boolean; onPress: () => void; className?: string }) {
  const copy = (props.uiLocale || '').toLowerCase().startsWith('ko') ? COPY.ko : COPY.en
  return (
    <button
      data-qa="live-demo-voice-talk-button"
      type="button"
      onClick={props.onPress}
      aria-label={copy.start}
      title={copy.start}
      className={`relative inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-950 ${props.className ?? ''}`}
    >
      <Phone size={19} strokeWidth={2.2} />
      {props.active ? <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-emerald-500" /> : null}
    </button>
  )
}

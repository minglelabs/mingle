'use client'

// Group voice talk inside the chat room (KakaoTalk style: the room stays the
// same room, voice is switched on and off). A panel slides down from under the
// top bar with up to 8 seats; drag it up (or tap the handle) to fold it into a
// slim bar.
//
// Voice talk and the room's speech-to-text are separate features: a call
// never starts or stops speech-to-text. The panel's mic button owns the voice
// sent into the call; the room's Start/Stop button owns speech-to-text (the
// text and its translation). What people say shows as the room's messages
// only while their speech-to-text is on, and the panel says so when it is off.
//
// The call itself runs in the native app (LiveKit audio). This panel only
// draws it and sends button presses over the RN bridge (see
// rn/src/voice/voiceBridge.ts for the message shapes).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, type PanInfo } from 'framer-motion'
import { ChevronUp, Mic, MicOff, PhoneOff, Phone } from 'lucide-react'
import LanguageFlag from '@/components/language-flag'
import { buildClientApiPath } from '@/lib/api-contract'
import { useRoomPresence } from '@/lib/room-presence'
import { useNativeBannerSuppression } from '@/lib/use-native-banner-suppression'

export const NATIVE_VOICE_EVENT = 'mingle:native-voice'
const MAX_SEATS = 8

type CallParticipant = { userId: string; name: string | null; image: string | null; speechLanguage?: string | null }
// `startedBy` comes from servers that send it.
type StatusCall = { id: string; participants: CallParticipant[]; maxParticipants: number; startedBy?: { userId: string; name: string | null } | null } | null
// `lang` and `micOn` come from app builds that share them; older builds send neither.
type RoomMember = { identity: string; userId: string; name: string; isLocal: boolean; isSpeaking: boolean; lang?: string; micOn?: boolean }
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
    micOnState: '마이크 켜짐',
    micOffState: '마이크 꺼짐',
    micMuted: '음소거',
    listenOnly: '듣기만 하는 중',
    leaveTitle: '보이스톡에서 나가시겠습니까?',
    cancel: '취소',
    startTitle: '대화방에 보이스톡을 시작하시겠습니까?',
    startConfirm: '시작',
    joinTitle: '진행 중인 보이스톡에 참여하시겠습니까?',
    startedBy: (name: string) => `${name}님이 보이스톡을 시작했습니다.`,
    startedBySomeone: '보이스톡이 시작됐습니다.',
    startedByMe: '내가 시작한 보이스톡이 진행 중입니다.',
    captionsOffHint: '자막·통역은 꺼져 있어요. 켜려면 아래 시작 버튼을 누르세요.',
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
    micOnState: 'Mic on',
    micOffState: 'Mic off',
    micMuted: 'Muted',
    listenOnly: 'Listening only',
    leaveTitle: 'Leave voice talk?',
    cancel: 'Cancel',
    startTitle: 'Start a voice talk in this room?',
    startConfirm: 'Start',
    joinTitle: 'Join the voice talk in progress?',
    startedBy: (name: string) => `${name} started a voice talk.`,
    startedBySomeone: 'A voice talk has started.',
    startedByMe: 'The voice talk you started is still going.',
    captionsOffHint: 'Captions and interpretation are off. Press Start below to turn them on.',
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

export function isVoiceTalkAvailable(): boolean {
  return bridge() !== null
}

function initial(name: string | null | undefined): string {
  const trimmed = (name || '').trim()
  return trimmed ? Array.from(trimmed)[0].toUpperCase() : '?'
}

/** Joins the room's call, starting it when none is live (one call per room, kept by the server). */
export function joinVoiceTalk(input: { conversationId: string; title?: string; lang: string }) {
  post({
    type: 'native_voice_open',
    payload: { conversationId: input.conversationId, title: input.title, lang: input.lang, interpret: false },
  })
}

/** Switches the voice this phone sends into the call. */
export function setVoiceTalkMic(on: boolean) {
  post({ type: 'native_voice_set', payload: { mic: on } })
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
  /** Bumped by the room's voice talk button outside a call: asks whether to start (or join) one. */
  openSignal?: number
  /** Bumped by the room's voice talk button during a call: asks whether to leave. */
  leaveSignal?: number
  /** Listen only: in a seat, sending no voice. Owned by the room (it drives the mic). */
  listenOnly?: boolean
  onListenOnlyChange?: (listenOnly: boolean) => void
  /** The app reported its mic (on returning to the room): show it, switch nothing. */
  onListenOnlySync?: (listenOnly: boolean) => void
  /** The room's speech-to-text is running. Off in a call means voice only: the panel says so. */
  captionsOn?: boolean
  /** Opens a member's profile when their seat is tapped. */
  onOpenProfile?: (userId: string) => void
  /** This viewer's account id: always counted as having the room open. */
  viewerUserId?: string | null
}

export default function VoiceTalkPanel(props: VoiceTalkPanelProps) {
  const { conversationId, conversationTitle, myLang, openSignal, leaveSignal, onAvailabilityChange, onListenOnlyChange, onOpenProfile } = props
  const listenOnly = props.listenOnly === true
  const viewerUserId = props.viewerUserId ?? null
  const copy = (props.uiLocale || '').toLowerCase().startsWith('ko') ? COPY.ko : COPY.en
  const [call, setCall] = useState<StatusCall>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [room, setRoom] = useState<RoomSnapshot | null>(null)
  const [folded, setFolded] = useState(false)
  // The voice talk button outside a call: "start a voice talk?" (or "join?").
  const [startPrompt, setStartPrompt] = useState(false)
  // A call this phone declined is not offered again by itself; its message in
  // the room still joins it.
  const [declinedCallId, setDeclinedCallId] = useState<string | null>(null)

  const joined = phase === 'connecting' || phase === 'connected'
  // The phase as the event handler below needs it (it outlives a render).
  const phaseRef = useRef<Phase>('idle')
  const onListenOnlySyncRef = useRef(props.onListenOnlySync)
  useEffect(() => { onListenOnlySyncRef.current = props.onListenOnlySync }, [props.onListenOnlySync])

  useEffect(() => {
    if (!conversationId || !bridge()) return
    const onEvent = (event: Event) => {
      const detail = (event as CustomEvent<VoiceEvent>).detail
      if (!detail || ('conversationId' in detail && detail.conversationId && detail.conversationId !== conversationId)) return
      if (detail.type === 'status') {
        // The app reports a call it is in before the first status arrives, so
        // "not joined" here is real. A call remembered from before a restart
        // is left now, and this viewer leaves its seat at once.
        const joinedNow = phaseRef.current === 'connecting' || phaseRef.current === 'connected'
        if (isAbandonedJoinedCall({ rememberedCallId: readJoinedCallMarker(conversationId), call: detail.call, viewerUserId, joinedNow }) && detail.call) {
          writeJoinedCallMarker(conversationId, null)
          void fetch(buildClientApiPath(`/conversations/${encodeURIComponent(conversationId)}/voice/leave`), { method: 'POST' }).catch(() => undefined)
          setCall({ ...detail.call, participants: detail.call.participants.filter((p) => p.userId !== viewerUserId) })
          return
        }
        setCall(detail.call)
      } else if (detail.type === 'room') {
        setRoom(detail.snapshot)
        // The app's mic is the truth: a muted call stays muted however often
        // this screen is closed and opened.
        if (detail.snapshot && typeof detail.snapshot.micOn === 'boolean') onListenOnlySyncRef.current?.(!detail.snapshot.micOn)
      }
      else if (detail.type === 'state') {
        phaseRef.current = detail.phase
        if (detail.phase === 'left') writeJoinedCallMarker(conversationId, null)
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
  }, [call])

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
  }, [call, conversationId, onListenOnlyChange, room, viewerUserId])

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

  // Room members who are not in the call, shown small under the seats.
  const presence = useRoomPresence(conversationId)
  const [roomMembers, setRoomMembers] = useState<RoomMemberSummary[]>([])
  const panelShown = joined || !!error
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

  // The panel is the call this phone is in. Before joining there is nothing
  // to show under the top bar: starting and joining are the dialogs above.
  if (!joined && !error) {
    return <>{startDialog}{incomingCard}</>
  }

  const count = joined && room ? room.members.length : call?.participants.length ?? 0

  return (
    <>
    {leaveDialog}
    {startDialog}
    {incomingCard}
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
              {seats.slice(0, 4).map((s) => (
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
              <div className="grid grid-cols-4 gap-x-2 gap-y-2.5 px-3 pb-2 pt-1">
                {Array.from({ length: MAX_SEATS }, (_, i) => seats[i] ?? null).map((s, i) => (
                  <VoiceTalkSeatView
                    key={s?.key ?? `empty-${i}`}
                    seat={s}
                    label={s ? (s.isLocal ? copy.me : s.name) : copy.empty}
                    mutedLabel={copy.micMuted}
                    onOpenProfile={onOpenProfile}
                  />
                ))}
              </div>

              {error ? <p className="px-3 pb-2 text-[0.8rem] text-rose-600">{error}</p> : null}

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

              {joined && props.captionsOn === false ? (
                <p data-qa="voice-talk-captions-off-hint" className="px-3 pb-2 text-center text-[0.76rem] text-gray-500">
                  {copy.captionsOffHint}
                </p>
              ) : null}

              {joined ? (
                <div className="flex items-center justify-center gap-4 border-t border-gray-100 px-3 py-2.5">
                  {/* Shows the mic's state; pressing it switches. */}
                  <button
                    type="button"
                    data-qa="voice-talk-mic-toggle"
                    aria-pressed={!listenOnly}
                    onClick={() => onListenOnlyChange?.(!listenOnly)}
                    className={`inline-flex h-11 min-w-[124px] items-center justify-center gap-1.5 rounded-full px-5 text-[0.86rem] font-semibold transition-colors ${
                      listenOnly ? 'bg-gray-100 text-gray-400 active:bg-gray-200' : 'bg-red-500 text-white shadow-sm active:bg-red-600'
                    }`}
                  >
                    {listenOnly ? <><MicOff size={17} /> {copy.micOffState}</> : <><Mic size={17} /> {copy.micOnState}</>}
                  </button>
                  <button
                    type="button"
                    data-qa="voice-talk-leave"
                    // Inside the panel the button is unmistakable: it leaves at
                    // once. Only the room's phone button asks first.
                    onClick={leave}
                    className="inline-flex h-11 min-w-[124px] items-center justify-center gap-1.5 rounded-full bg-rose-50 px-5 text-[0.86rem] font-semibold text-rose-600 active:bg-rose-100"
                  >
                    <PhoneOff size={17} /> {copy.leave}
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
 * One of the 8 seats: a round avatar with the member's language flag at its
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
      {seat ? (seat.image ? <img src={seat.image} alt="" className="h-full w-full object-cover" /> : initial(seat.name)) : ''}
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
            <span aria-hidden="true" data-qa="voice-talk-seat-speaking" className="mingle-voice-ripple pointer-events-none absolute inset-0 rounded-full bg-slate-400/25" />
            <span aria-hidden="true" className="mingle-voice-ripple mingle-voice-ripple-late pointer-events-none absolute inset-0 rounded-full bg-slate-400/25" />
            <span aria-hidden="true" className="pointer-events-none absolute -inset-[3px] rounded-full bg-slate-300/30" />
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

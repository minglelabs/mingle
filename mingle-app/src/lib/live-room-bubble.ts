// The live room bubble: while a voice talk call (or live speech recognition) is
// running in a room that is not on screen, a small floating bubble shows it and
// leads back to the room (docs/home-explore-rooms-plan.md §5). Not system
// picture-in-picture: it is drawn by the page.
//
// The call runs in the app shell (LiveKit) and reports to whatever page is
// loaded through the `mingle:native-voice` window event, so this store hears
// about it on every tab. Live speech recognition is reported by the chat list,
// which owns it, so its bubble exists only on the Chats tab.

import { useSyncExternalStore } from 'react'

export const NATIVE_VOICE_EVENT_NAME = 'mingle:native-voice'

export type LiveRoomMember = { userId: string; name: string; isLocal: boolean; isSpeaking: boolean }

export type LiveRoomState = {
  /** The call this phone is in. */
  voice: { conversationId: string; members: LiveRoomMember[] } | null
  /** The room whose speech recognition is running (Chats tab only). */
  stt: { conversationId: string; title: string } | null
  /** The room on screen now, if any. */
  visibleRoomId: string | null
}

export type LiveRoomBubbleView = {
  kind: 'voice' | 'stt'
  conversationId: string
  title: string
  /**
   * The face to show: the room's host while they are in the call (owner,
   * 2026-11-25); in a room with no host there, whoever is speaking, else the
   * last one who spoke, else someone else in the call.
   */
  face: { userId: string; name: string; image: string | null; speaking: boolean } | null
  /** How many people are in the call (0 for speech recognition). */
  count: number
}

type Remembered = { title: string; lang: string }

let state: LiveRoomState = { voice: null, stt: null, visibleRoomId: null }
let lastSpeakerId: string | null = null
const remembered = new Map<string, Remembered>()
const images = new Map<string, string>()
/** Room id → the host of its call (open rooms have one). */
const hosts = new Map<string, string>()
const listeners = new Set<() => void>()
let view: LiveRoomBubbleView | null = null
let listening = false

/**
 * What the bubble shows for a state, or null for no bubble. The room on screen
 * never gets one; a call wins over speech recognition.
 */
export function resolveLiveRoomBubble(input: {
  state: LiveRoomState
  titleOf: (conversationId: string) => string
  imageOf: (userId: string) => string | null
  lastSpeakerId: string | null
  /** The host of a room's call, when the server said who it is. */
  hostOf?: (conversationId: string) => string | null
}): LiveRoomBubbleView | null {
  const { voice, stt, visibleRoomId } = input.state
  if (voice && voice.conversationId !== visibleRoomId) {
    const others = voice.members.filter((member) => !member.isLocal)
    const speaking = voice.members.find((member) => member.isSpeaking && !member.isLocal)
      ?? voice.members.find((member) => member.isSpeaking)
    const hostId = input.hostOf?.(voice.conversationId) ?? null
    const host = hostId ? voice.members.find((member) => member.userId === hostId) ?? null : null
    if (host) {
      return {
        kind: 'voice',
        conversationId: voice.conversationId,
        title: input.titleOf(voice.conversationId),
        face: { userId: host.userId, name: host.name, image: input.imageOf(host.userId), speaking: host.isSpeaking },
        count: voice.members.length,
      }
    }
    const pick = speaking
      ?? others.find((member) => member.userId === input.lastSpeakerId)
      ?? others[0]
      ?? voice.members[0]
      ?? null
    return {
      kind: 'voice',
      conversationId: voice.conversationId,
      title: input.titleOf(voice.conversationId),
      face: pick ? { userId: pick.userId, name: pick.name, image: input.imageOf(pick.userId), speaking: Boolean(speaking) } : null,
      count: voice.members.length,
    }
  }
  if (stt && stt.conversationId !== visibleRoomId) {
    return { kind: 'stt', conversationId: stt.conversationId, title: stt.title, face: null, count: 0 }
  }
  return null
}

function sameView(left: LiveRoomBubbleView | null, right: LiveRoomBubbleView | null): boolean {
  if (!left || !right) return left === right
  return left.kind === right.kind && left.conversationId === right.conversationId && left.title === right.title
    && left.face?.userId === right.face?.userId && left.face?.name === right.face?.name
    && left.face?.image === right.face?.image && left.face?.speaking === right.face?.speaking
    && left.count === right.count
}

function refresh(): void {
  const next = resolveLiveRoomBubble({
    state,
    titleOf: (conversationId) => remembered.get(conversationId)?.title ?? '',
    imageOf: (userId) => images.get(userId) ?? null,
    lastSpeakerId,
    hostOf: (conversationId) => hosts.get(conversationId) ?? null,
  })
  if (sameView(view, next)) return
  view = next
  for (const listener of listeners) listener()
}

function readMembers(raw: unknown): LiveRoomMember[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((entry): LiveRoomMember[] => {
    const member = entry as Partial<LiveRoomMember> | null
    if (!member || typeof member.userId !== 'string' || !member.userId) return []
    return [{ userId: member.userId, name: typeof member.name === 'string' ? member.name : '', isLocal: member.isLocal === true, isSpeaking: member.isSpeaking === true }]
  })
}

/** One `mingle:native-voice` event (see rn/src/voice/voiceBridge.ts for the shapes). */
export function applyNativeVoiceEvent(detail: unknown): void {
  const event = detail as { type?: unknown; phase?: unknown; conversationId?: unknown; snapshot?: { members?: unknown }; call?: { participants?: unknown; stage?: { hostUserId?: unknown } | null } | null } | null
  if (!event || typeof event.type !== 'string') return
  const conversationId = typeof event.conversationId === 'string' ? event.conversationId : ''
  if (event.type === 'room' && conversationId) {
    const members = readMembers(event.snapshot?.members)
    const speaker = members.find((member) => member.isSpeaking && !member.isLocal)
    if (speaker) lastSpeakerId = speaker.userId
    state = { ...state, voice: { conversationId, members } }
  } else if (event.type === 'state') {
    if (event.phase === 'connecting' || event.phase === 'connected') {
      if (conversationId && state.voice?.conversationId !== conversationId) {
        lastSpeakerId = null
        state = { ...state, voice: { conversationId, members: [] } }
      }
    } else if (!conversationId || state.voice?.conversationId === conversationId) {
      // left, error or idle: this phone is out of the call.
      state = { ...state, voice: null }
    }
  } else if (event.type === 'status') {
    // The server's list has the photos; keep them for the bubble's face.
    const participants = Array.isArray(event.call?.participants) ? event.call.participants : []
    for (const entry of participants as Array<{ userId?: unknown; image?: unknown }>) {
      if (typeof entry?.userId === 'string' && typeof entry.image === 'string' && entry.image) images.set(entry.userId, entry.image)
    }
    const hostUserId = event.call?.stage?.hostUserId
    if (conversationId && typeof hostUserId === 'string' && hostUserId) hosts.set(conversationId, hostUserId)
    else if (conversationId && event.call) hosts.delete(conversationId)
  } else {
    return
  }
  refresh()
}

function startListening(): void {
  if (listening || typeof window === 'undefined') return
  listening = true
  window.addEventListener(NATIVE_VOICE_EVENT_NAME, (event) => applyNativeVoiceEvent((event as CustomEvent).detail))
}

/** The room on screen (null: none). Its own bubble is hidden while it is. */
export function publishVisibleRoom(conversationId: string | null): void {
  if (state.visibleRoomId === conversationId) return
  state = { ...state, visibleRoomId: conversationId }
  refresh()
}

/** The room whose speech recognition is running (null: none). Reported by the chat list. */
export function publishLiveStt(room: { conversationId: string; title: string } | null): void {
  if (state.stt?.conversationId === room?.conversationId && state.stt?.title === room?.title) return
  state = { ...state, stt: room }
  refresh()
}

/** A room's title, and the language its call was joined in (for "undo" after leaving from the bubble). */
export function rememberLiveRoom(conversationId: string, room: { title?: string | null; lang?: string | null }): void {
  if (!conversationId) return
  const current = remembered.get(conversationId)
  remembered.set(conversationId, { title: room.title?.trim() || current?.title || '', lang: room.lang || current?.lang || '' })
  refresh()
}

export function getRememberedLiveRoom(conversationId: string): Remembered | null {
  return remembered.get(conversationId) ?? null
}

type LiveRoomHandlers = {
  /** Open the room in place (the Chats tab is on screen). */
  openRoom?: (conversationId: string) => boolean
  /** Stop the running speech recognition. */
  stopStt?: (conversationId: string) => void
}
let handlers: LiveRoomHandlers = {}

/** The chat list registers how to open a room and how to stop its speech recognition; it clears them when it goes away. */
export function setLiveRoomHandlers(next: LiveRoomHandlers | null): void {
  handlers = next ?? {}
}

export function getLiveRoomHandlers(): LiveRoomHandlers {
  return handlers
}

function subscribe(listener: () => void): () => void {
  startListening()
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** The bubble to draw, or null. */
export function useLiveRoomBubble(): LiveRoomBubbleView | null {
  return useSyncExternalStore(subscribe, () => view, () => null)
}

export function resetLiveRoomBubbleForTests(): void {
  state = { voice: null, stt: null, visibleRoomId: null }
  lastSpeakerId = null
  remembered.clear()
  images.clear()
  listeners.clear()
  view = null
  handlers = {}
}

export function getLiveRoomBubbleForTests(): LiveRoomBubbleView | null {
  return view
}

// ── Where the bubble rests ──────────────────────────────────────────────────

export type BubbleBox = { width: number; height: number }
export type BubbleArea = {
  width: number
  height: number
  /** Kept clear at the top (status bar, header). */
  top: number
  /** Kept clear at the bottom (tab bar, keyboard). */
  bottom: number
}
export type BubbleRest = { side: 'left' | 'right'; y: number; folded: boolean }

export const BUBBLE_EDGE_GAP = 8
/** Thrown this far past an edge, the bubble folds into a thin handle there. */
export const BUBBLE_FOLD_OVERSHOOT = 28
export const BUBBLE_HANDLE_WIDTH = 18
/** The "let go here to leave" circle, at the bottom centre while dragging. */
export const BUBBLE_DROP_RADIUS = 44

export function clampBubbleY(y: number, box: BubbleBox, area: BubbleArea): number {
  const min = area.top + BUBBLE_EDGE_GAP
  const max = Math.max(min, area.height - area.bottom - box.height - BUBBLE_EDGE_GAP)
  return Math.min(max, Math.max(min, y))
}

/** Where a dragged bubble comes to rest: the nearer side, folded when it was thrown past that edge. */
export function restBubble(drop: { x: number; y: number }, box: BubbleBox, area: BubbleArea): BubbleRest {
  const centre = drop.x + box.width / 2
  const side = centre < area.width / 2 ? 'left' : 'right'
  const folded = side === 'left' ? drop.x < -BUBBLE_FOLD_OVERSHOOT : drop.x + box.width > area.width + BUBBLE_FOLD_OVERSHOOT
  return { side, y: clampBubbleY(drop.y, box, area), folded }
}

/** The left offset a resting bubble is drawn at. */
export function bubbleLeft(rest: BubbleRest, box: BubbleBox, area: BubbleArea): number {
  if (rest.folded) return rest.side === 'left' ? 0 : area.width - BUBBLE_HANDLE_WIDTH
  return rest.side === 'left' ? BUBBLE_EDGE_GAP : area.width - box.width - BUBBLE_EDGE_GAP
}

/** The centre of the leave circle. */
export function bubbleDropPoint(area: BubbleArea): { x: number; y: number } {
  return { x: area.width / 2, y: area.height - area.bottom - BUBBLE_DROP_RADIUS - 12 }
}

/** Whether a bubble dragged to `position` is over the leave circle. */
export function isOverBubbleDrop(position: { x: number; y: number }, box: BubbleBox, area: BubbleArea): boolean {
  const target = bubbleDropPoint(area)
  const dx = position.x + box.width / 2 - target.x
  const dy = position.y + box.height / 2 - target.y
  return Math.hypot(dx, dy) <= BUBBLE_DROP_RADIUS + 14
}

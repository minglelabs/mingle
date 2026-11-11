// The room message a Hash Rush game leaves when it starts: "<name> started
// Hash Rush", with a Join button. Like the voice talk one
// (voice-call-message.ts): an ordinary room message whose metadata names the
// game, so the room list, unread counts and history carry it.

export type HashRushMessage = {
  /** The game this message announces. The button joins it while it runs. */
  sessionId: string
}

/** Stored as the message's source text; shown where only text fits (room list preview). */
export const HASH_RUSH_MESSAGE_TEXT = '🌻 Hash Rush'

/** One announcement per game: a retried start writes the same message. */
export function buildHashRushMessageClientId(sessionId: string): string {
  return `hash-rush-${sessionId}`
}

export function normalizeHashRushMessage(value: unknown): HashRushMessage | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const sessionId = (value as { sessionId?: unknown }).sessionId
  return typeof sessionId === 'string' && sessionId.trim() ? { sessionId: sessionId.trim() } : null
}

/** The room's running game, as the app server tells it. */
export type HashRushRoomGame = {
  sessionId: string
  startedBy: { userId: string, name: string | null } | null
}

export function parseHashRushRoomGame(value: unknown): HashRushRoomGame | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const record = value as { sessionId?: unknown, startedBy?: unknown }
  if (typeof record.sessionId !== 'string' || !record.sessionId.trim()) return null
  const by = record.startedBy as { userId?: unknown, name?: unknown } | null | undefined
  return {
    sessionId: record.sessionId,
    startedBy: by && typeof by.userId === 'string'
      ? { userId: by.userId, name: typeof by.name === 'string' ? by.name : null }
      : null,
  }
}

/** What the Join button of an announcement does, given the room's game right now. */
export type HashRushMessageState = 'joinable' | 'joined' | 'ended'

export function resolveHashRushMessageState(input: {
  message: HashRushMessage
  /** The room's running game, or null when none runs. */
  liveSessionId: string | null
  /** This phone is in the game. */
  joined: boolean
}): HashRushMessageState {
  if (!input.liveSessionId || input.liveSessionId !== input.message.sessionId) return 'ended'
  return input.joined ? 'joined' : 'joinable'
}

/** What the room's Hash Rush menu item does. */
export type HashRushMenuAction = 'open' | 'confirm_join' | 'confirm_start'

export function resolveHashRushMenuAction(input: { playing: boolean, liveSessionId: string | null }): HashRushMenuAction {
  if (input.playing) return 'open'
  return input.liveSessionId ? 'confirm_join' : 'confirm_start'
}

/**
 * The invite card: someone else's game is running, this phone is not in it,
 * and this viewer has not turned this game down.
 */
export function shouldOfferHashRushInvite(input: {
  game: HashRushRoomGame | null
  playing: boolean
  viewerUserId: string | null
  declinedSessionId: string | null
}): boolean {
  if (!input.game || input.playing) return false
  if (input.game.sessionId === input.declinedSessionId) return false
  return !(input.viewerUserId && input.game.startedBy?.userId === input.viewerUserId)
}

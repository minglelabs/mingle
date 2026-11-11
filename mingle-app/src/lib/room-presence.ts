// Who has a room open right now. The messaging server sends a `presence`
// frame to every live reader of a room whenever someone opens or closes it;
// the room's socket handler stores the list here, and anything on the room
// screen can read it. A room nobody reported on yet has no list (null), which
// is "unknown", not "nobody".

import { useSyncExternalStore } from 'react'

const viewersByConversation = new Map<string, readonly string[]>()
const listeners = new Set<() => void>()

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index])
}

/** Stores the user ids with the room open, as the server reported them. */
export function publishRoomPresence(conversationId: string, userIds: unknown): void {
  if (!conversationId || !Array.isArray(userIds)) return
  const next = [...new Set(userIds.filter((id): id is string => typeof id === 'string' && id !== ''))].sort()
  const current = viewersByConversation.get(conversationId)
  if (current && sameIds(current, next)) return
  viewersByConversation.set(conversationId, next)
  for (const listener of listeners) listener()
}

/** The room's connection is gone: what was known is stale. */
export function clearRoomPresence(conversationId: string): void {
  if (!viewersByConversation.delete(conversationId)) return
  for (const listener of listeners) listener()
}

export function getRoomPresence(conversationId: string): readonly string[] | null {
  return viewersByConversation.get(conversationId) ?? null
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** User ids with the room open, or null while unknown. */
export function useRoomPresence(conversationId: string | null | undefined): readonly string[] | null {
  return useSyncExternalStore(
    subscribe,
    () => (conversationId ? getRoomPresence(conversationId) : null),
    () => null,
  )
}

export function resetRoomPresenceForTests(): void {
  viewersByConversation.clear()
  listeners.clear()
}

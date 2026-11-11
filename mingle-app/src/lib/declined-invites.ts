// An invite card turned down (a Hash Rush game, a voice talk) is not offered
// again for that same game or call, also after the app restarts. The room's
// message still joins it, and the room menu still finds it. Kept on this
// device, one id per room and kind: a new game or call has a new id.

export type DeclinedInviteKind = 'hash-rush' | 'voice-talk'

const KEY_PREFIX = 'mingle_declined_invite:'

const keyOf = (kind: DeclinedInviteKind, conversationId: string) => `${KEY_PREFIX}${kind}:${conversationId}`

export function readDeclinedInvite(kind: DeclinedInviteKind, conversationId: string | null | undefined): string | null {
  if (!conversationId || typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(keyOf(kind, conversationId))
  } catch {
    return null
  }
}

export function writeDeclinedInvite(kind: DeclinedInviteKind, conversationId: string | null | undefined, id: string | null): void {
  if (!conversationId || typeof window === 'undefined') return
  try {
    if (id) window.localStorage.setItem(keyOf(kind, conversationId), id)
    else window.localStorage.removeItem(keyOf(kind, conversationId))
  } catch {
    // No storage: the card is still not offered again until the app restarts.
  }
}

/**
 * Lets the notification list clear the bell's red dot the moment it marks
 * everything read, instead of waiting for the next focus refetch.
 *
 * - `markNotificationsReadOptimistically(request)` is called by the panel with
 *   its PATCH. Every mounted `useUnreadNotifications` hook drops its dot at
 *   once (the event), and a dot fetch that starts before the PATCH settles
 *   waits for it (`awaitPendingNotificationRead`), so a header that remounts
 *   right after "back" cannot re-read a stale "unread" from the server.
 */

export const NOTIFICATIONS_READ_EVENT = 'mingle:notifications-read'

let pendingRead: Promise<unknown> | null = null

export function markNotificationsReadOptimistically(request: Promise<unknown>): void {
  const settled = request.then(
    () => undefined,
    () => undefined,
  )
  pendingRead = settled
  void settled.then(() => {
    if (pendingRead === settled) pendingRead = null
  })
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new Event(NOTIFICATIONS_READ_EVENT))
  }
}

/** Resolves once any in-flight mark-read request has settled (immediately if none). */
export function awaitPendingNotificationRead(): Promise<void> {
  return pendingRead ? pendingRead.then(() => undefined) : Promise.resolve()
}

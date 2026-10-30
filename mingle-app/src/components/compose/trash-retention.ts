/**
 * Days left before a trashed post is permanently deleted. A post can be
 * restored for 30 days after `deletedAt`; this returns the whole days
 * remaining, clamped to [0, 30].
 */
export const TRASH_RETENTION_DAYS = 30

export function trashDaysLeft(deletedAt: string | null, now: number = Date.now()): number {
  if (!deletedAt) return TRASH_RETENTION_DAYS
  const deleted = new Date(deletedAt).getTime()
  if (!Number.isFinite(deleted)) return TRASH_RETENTION_DAYS
  const elapsedMs = now - deleted
  const remainingDays = TRASH_RETENTION_DAYS - Math.floor(elapsedMs / (24 * 60 * 60 * 1000))
  return Math.max(0, Math.min(TRASH_RETENTION_DAYS, remainingDays))
}

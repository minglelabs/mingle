/**
 * One visibility rule for the notification center, shared by the list read
 * (`GET /notifications`) and the red-dot probe (`GET /notifications/unread`).
 *
 * If the dot used a looser rule than the list, a notification the list
 * withholds (actor now blocked, post deleted / hidden / archived) could stay
 * unread forever: the viewer never sees it, yet the dot keeps asking for it.
 * Both reads therefore filter with exactly this `where`.
 */
import type { Prisma } from '@prisma/client'
import { notMutuallyBlockedWhere } from '@/server/posts/block-visibility'
import { visiblePostWhere } from '@/server/posts/post-visibility'

// Types that reference a post; when that post is no longer visible to the
// viewer the notification is withheld. Follow and report_resolved are not
// post-scoped.
export const POST_SCOPED_NOTIFICATION_TYPES = ['post_like', 'comment', 'comment_reply', 'comment_like'] as const

export function visibleNotificationWhere(viewerId: string): Prisma.UserNotificationWhereInput {
  return {
    recipientId: viewerId,
    actor: notMutuallyBlockedWhere(viewerId),
    OR: [
      { type: { notIn: [...POST_SCOPED_NOTIFICATION_TYPES] } },
      {
        type: { in: [...POST_SCOPED_NOTIFICATION_TYPES] },
        post: visiblePostWhere(viewerId),
      },
    ],
  }
}

/**
 * Parse the `before` snapshot a client sends back when it marks the list
 * read. Only notifications created at or before it are marked, so one that
 * arrives between the list read and the mark stays unread. A missing, invalid
 * or future value falls back to `now` (older clients send no body).
 */
export function resolveReadBefore(raw: unknown, now: Date = new Date()): Date {
  if (typeof raw !== 'string' || !raw.trim()) return now
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return now
  return parsed.getTime() > now.getTime() ? now : parsed
}

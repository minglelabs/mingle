/**
 * CONTRACT STUB — the notification center replaces the body; the signature is frozen.
 *
 * The single entry point for every posting-feature notification. The
 * implementation owns: self-notification suppression, same-person dedupe, the
 * recipient's in-app switch (User.inAppNotificationsEnabled), and push delivery
 * (comments and replies push; likes and report results are in-app only).
 *
 * It must never throw into the caller: a failed notification cannot fail the
 * like, comment or report action that triggered it.
 */
import { prisma } from '@/lib/prisma'
import { sendPushNotificationForUserNotification } from '@/server/push-notifications'

export type PostNotificationInput =
  | { type: 'post_like'; recipientId: string; actorId: string; postId: string }
  | { type: 'comment'; recipientId: string; actorId: string; postId: string; commentId: string }
  | { type: 'comment_reply'; recipientId: string; actorId: string; postId: string; commentId: string }
  | { type: 'comment_like'; recipientId: string; actorId: string; postId: string; commentId: string }
  /**
   * Sent to the reporter when an operator closes their report. There is no
   * human actor: pass the reporter as `actorId`. Self-suppression does not
   * apply to this type, and the renderer ignores the actor. `reportId` scopes
   * the dedupe: each closed report notifies its reporter exactly once.
   */
  | { type: 'report_resolved'; recipientId: string; actorId: string; reportId: string }

/** Only comment and reply notifications are delivered as a push. */
const PUSH_TYPES: ReadonlySet<PostNotificationInput['type']> = new Set([
  'comment',
  'comment_reply',
])

function normalizeId(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * The scope of "the same notification from the same person". A like on a post
 * is one row per (recipient, actor, post); a comment/reply/comment-like is one
 * row per (recipient, actor, comment). This is what makes unliking and liking
 * again reuse the existing row instead of creating a new one. A report result
 * is one row per report, so a reporter hears about every report they filed —
 * and only once per report, even if an operator reopens and closes it again.
 */
function dedupeWhere(input: PostNotificationInput): {
  recipientId: string
  actorId: string
  type: PostNotificationInput['type']
  postId?: string | null
  commentId?: string | null
  reportId?: string
} {
  const base = {
    recipientId: input.recipientId,
    actorId: input.actorId,
    type: input.type,
  }
  switch (input.type) {
    case 'post_like':
      return { ...base, postId: input.postId, commentId: null }
    case 'comment':
    case 'comment_reply':
    case 'comment_like':
      return { ...base, commentId: input.commentId }
    case 'report_resolved':
      return { ...base, reportId: normalizeId(input.reportId) }
  }
}

export async function createPostNotification(input: PostNotificationInput): Promise<void> {
  try {
    const recipientId = normalizeId(input.recipientId)
    const actorId = normalizeId(input.actorId)
    if (!recipientId || !actorId) return
    const reportId = input.type === 'report_resolved' ? normalizeId(input.reportId) : null
    // Without its report a result row could not be deduped per report.
    if (input.type === 'report_resolved' && !reportId) return

    // Never notify someone about their own action. The one exception is a
    // report result, which is always delivered to the reporter (who is passed
    // as both recipient and actor).
    if (input.type !== 'report_resolved' && recipientId === actorId) return

    // The recipient's single in-app switch. When it is off, no in-app row is
    // created (and therefore no push either, since a push mirrors a row).
    const recipient = await prisma.user.findUnique({
      where: { id: recipientId },
      select: { inAppNotificationsEnabled: true },
    })
    if (!recipient || recipient.inAppNotificationsEnabled === false) return

    const where = dedupeWhere(input)

    // Same-person dedupe: a matching row already covers this event.
    const existing = await prisma.userNotification.findFirst({
      where,
      select: { id: true },
    })
    if (existing) return

    const postId = 'postId' in input ? normalizeId(input.postId) || null : null
    const commentId = 'commentId' in input ? normalizeId(input.commentId) || null : null

    const notification = await prisma.userNotification.create({
      data: {
        recipientId,
        actorId,
        type: input.type,
        postId,
        commentId,
        reportId,
      },
      select: { id: true },
    })

    // Push is best-effort and only for conversational events. Likes and report
    // results live in the panel only.
    if (PUSH_TYPES.has(input.type)) {
      try {
        await sendPushNotificationForUserNotification(notification.id)
      } catch (error) {
        console.error('[create-post-notification] push delivery failed', {
          type: input.type,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  } catch (error) {
    // A failed notification must never fail the action that triggered it.
    console.error('[create-post-notification] failed', {
      type: input.type,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

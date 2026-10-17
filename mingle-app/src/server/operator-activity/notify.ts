import { prisma } from '@/lib/prisma'
import { resolveAccountBadge, withAccountBadgeLabel } from '@/lib/account-badge'
import { publishAdminInboxEvent } from '@/server/conversation-realtime'
import { encodeOperatorInboxActorLabel } from '@/server/operator-inbox/push-copy'
import { sendPushToUsers } from '@/server/push-notifications'

/**
 * Operator-activity notify seam. Called once per new in-app notification
 * addressed to an operator account (which has no device of its own):
 * - publishes the admin realtime topic (content-free), so an open
 *   `/admin/activity` refetches;
 * - for a comment or a reply from a real user, pushes a staff alert to every
 *   AdminNotifyTarget, at most once per post every 20 s. The tap opens the
 *   thread at `/admin/activity/posts/<postId>`.
 * Likes and follows only refresh the list, as they are in-app only for
 * every user. It never throws.
 */
export type OperatorActivityEvent = {
  type: string
  /** The operator account that received the notification. */
  recipientId: string
  actorId: string
  postId?: string | null
  commentId?: string | null
}

export const OPERATOR_ACTIVITY_PUSH_COALESCE_MS = 20_000

const PUSH_TYPES = new Set(['comment', 'comment_reply'])
const PUBLISH_TIMEOUT_MS = 2_000
const MAX_TRACKED_POSTS = 1_000
const lastPushAtByPost = new Map<string, number>()

function claimPushSlot(postId: string, now: number): boolean {
  const lastPushAt = lastPushAtByPost.get(postId)
  if (lastPushAt !== undefined && now - lastPushAt < OPERATOR_ACTIVITY_PUSH_COALESCE_MS) return false
  lastPushAtByPost.set(postId, now)
  if (lastPushAtByPost.size > MAX_TRACKED_POSTS) {
    for (const [trackedPostId, pushedAt] of lastPushAtByPost) {
      if (now - pushedAt >= OPERATOR_ACTIVITY_PUSH_COALESCE_MS) lastPushAtByPost.delete(trackedPostId)
    }
  }
  return true
}

function displayName(user: { name: string | null; handle: string | null } | null | undefined): string {
  return user?.name?.trim() || (user?.handle ? `@${user.handle}` : '')
}

async function notify(event: OperatorActivityEvent): Promise<void> {
  const [recipient, actor] = await Promise.all([
    prisma.user.findUnique({
      where: { id: event.recipientId },
      select: { name: true, handle: true, isOperator: true, isDeleted: true },
    }),
    prisma.user.findUnique({
      where: { id: event.actorId },
      select: { name: true, handle: true, isOfficial: true, isOperator: true },
    }),
  ])
  if (!recipient?.isOperator || recipient.isDeleted) return
  // Activity between operator accounts is staff's own doing.
  if (!actor || actor.isOperator) return

  await publishAdminInboxEvent({ timeoutMs: PUBLISH_TIMEOUT_MS })

  const postId = typeof event.postId === 'string' ? event.postId.trim() : ''
  const commentId = typeof event.commentId === 'string' ? event.commentId.trim() : ''
  if (!PUSH_TYPES.has(event.type) || !postId || !commentId) return

  const targets = await prisma.adminNotifyTarget.findMany({
    where: {
      userId: { not: event.actorId },
      user: { isActive: true, isDeleted: false, deletedAt: null, withdrawnAt: null, isOperator: false },
    },
    select: { userId: true },
  })
  if (targets.length === 0) return
  if (!claimPushSlot(postId, Date.now())) return

  const comment = await prisma.postComment.findUnique({
    where: { id: commentId },
    select: { sourceText: true, imageObjectKey: true },
  })
  const preview = comment?.sourceText.trim() ?? ''
  const actorName = displayName(actor)
  const actorBadge = resolveAccountBadge(actor)
  const navigationUrl = `/admin/activity/posts/${encodeURIComponent(postId)}?as=${encodeURIComponent(event.recipientId)}&comment=${encodeURIComponent(commentId)}`
  await sendPushToUsers(targets.map((target) => target.userId), ({ language }) => ({
    notificationId: `operator-activity:${commentId}`,
    type: 'operator_inbox_message',
    actorId: event.actorId,
    actorLabel: encodeOperatorInboxActorLabel({
      operatorNames: [displayName(recipient)].filter(Boolean),
      senderLabel: actorName ? withAccountBadgeLabel(actorName, actorBadge, language) : '',
      kind: preview ? 'comment' : 'comment_photo',
    }),
    recipientLanguage: language,
    ...(preview ? { messagePreview: preview } : {}),
    navigationUrl,
  }))
}

export async function notifyOperatorActivity(event: OperatorActivityEvent): Promise<void> {
  try {
    await notify(event)
  } catch (error) {
    console.error('[operator-activity] notify_failed', {
      type: event?.type ?? null,
      error: error instanceof Error ? error.name : 'unknown',
    })
  }
}

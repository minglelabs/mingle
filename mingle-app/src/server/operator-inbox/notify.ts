import { prisma } from '@/lib/prisma'
import { resolveAccountBadge, withAccountBadgeLabel } from '@/lib/account-badge'
import { publishAdminInboxEvent } from '@/server/conversation-realtime'
import { sendPushToUsers } from '@/server/push-notifications'
import { encodeOperatorInboxActorLabel } from '@/server/operator-inbox/push-copy'

/**
 * Operator-inbox notify seam (contract §4). Called once per new message in a
 * room: next to the message push in the text path (never on a
 * translationUpdate), inside the photo path's `after()`, and by the admin
 * send path for operator replies.
 *
 * When the room has an active operator member (a materialized membership that
 * has not left, on a non-deleted operator account):
 * - publishes the admin inbox realtime topic (content-free), so an open
 *   `/admin/inbox` refetches;
 * - when the sender is NOT an operator, pushes `operator_inbox_message` to
 *   every AdminNotifyTarget (staff's own Mingle accounts) except the sender,
 *   at most once per room every 20 s. The tap opens `/admin/inbox/<id>`.
 * Rooms without an operator cost one indexed lookup and nothing else. It
 * never throws, and every call site still wraps it so a failure can never
 * affect the send.
 */
export type OperatorInboxActivity = {
  sessionKey: string
  /** Channel id when the caller knows it (the photo path does, the text path does not). */
  conversationId?: string | null
  senderUserId: string | null
  /** Room members at send time, sender included. */
  memberUserIds: string[]
  messageId: string
  /** The message's source text; null for a photo. */
  preview: string | null
  kind: 'text' | 'photo'
}

/** Staff get at most one alert per room in this window; the inbox itself updates live. */
export const OPERATOR_INBOX_PUSH_COALESCE_MS = 20_000

const ADMIN_INBOX_PUBLISH_TIMEOUT_MS = 2_000
// A process-local window is enough: the app runs as one long-lived service
// (the realtime bus is single-instance too).
const lastPushAtByRoom = new Map<string, number>()
const MAX_TRACKED_ROOMS = 1_000

/** Claims the room's alert slot, or returns false while its window is still open. */
function claimPushSlot(roomId: string, now: number): boolean {
  const lastPushAt = lastPushAtByRoom.get(roomId)
  if (lastPushAt !== undefined && now - lastPushAt < OPERATOR_INBOX_PUSH_COALESCE_MS) return false
  lastPushAtByRoom.set(roomId, now)
  if (lastPushAtByRoom.size > MAX_TRACKED_ROOMS) {
    for (const [trackedRoomId, pushedAt] of lastPushAtByRoom) {
      if (now - pushedAt >= OPERATOR_INBOX_PUSH_COALESCE_MS) lastPushAtByRoom.delete(trackedRoomId)
    }
  }
  return true
}

function displayName(user: { name: string | null; handle: string | null } | null | undefined): string {
  return user?.name?.trim() || (user?.handle ? `@${user.handle}` : '')
}

async function findRoomWithOperators(activity: OperatorInboxActivity) {
  const sessionKey = typeof activity.sessionKey === 'string' ? activity.sessionKey.trim() : ''
  const conversationId = typeof activity.conversationId === 'string' ? activity.conversationId.trim() : ''
  if (!sessionKey && !conversationId) return null
  return prisma.appConversationChannel.findFirst({
    where: {
      ...(conversationId ? { id: conversationId } : {}),
      ...(sessionKey ? { sessionKey } : {}),
      OR: [{ isDeleted: false }, { isDeleted: null }],
    },
    select: {
      id: true,
      members: {
        // Materialized members only: a pending invitee has no row yet.
        where: { leftAt: null, user: { isOperator: true, isDeleted: false } },
        orderBy: { joinedAt: 'asc' },
        select: { userId: true, user: { select: { name: true, handle: true } } },
      },
    },
  })
}

async function notify(activity: OperatorInboxActivity): Promise<void> {
  const room = await findRoomWithOperators(activity)
  if (!room || room.members.length === 0) return

  await publishAdminInboxEvent({ timeoutMs: ADMIN_INBOX_PUBLISH_TIMEOUT_MS })

  const senderUserId = typeof activity.senderUserId === 'string' && activity.senderUserId.trim()
    ? activity.senderUserId.trim()
    : null
  // An operator reply (the admin send path) only refreshes the inbox.
  if (senderUserId && room.members.some((member) => member.userId === senderUserId)) return
  const sender = senderUserId
    ? await prisma.user.findUnique({
        where: { id: senderUserId },
        select: { name: true, handle: true, isOfficial: true, isOperator: true },
      })
    : null
  if (sender?.isOperator) return

  const targets = await prisma.adminNotifyTarget.findMany({
    where: {
      ...(senderUserId ? { userId: { not: senderUserId } } : {}),
      user: { isActive: true, isDeleted: false, deletedAt: null, withdrawnAt: null, isOperator: false },
    },
    select: { userId: true },
  })
  if (targets.length === 0) return
  if (!claimPushSlot(room.id, Date.now())) return

  const operatorNames = room.members.map((member) => displayName(member.user)).filter(Boolean)
  const senderName = displayName(sender)
  const senderBadge = resolveAccountBadge(sender)
  const navigationUrl = `/admin/inbox/${encodeURIComponent(room.id)}`
  await sendPushToUsers(targets.map((target) => target.userId), ({ language }) => ({
    // Distinct from the member-facing message push, whose id is the message id.
    notificationId: `operator-inbox:${activity.messageId}`,
    type: 'operator_inbox_message',
    actorId: senderUserId ?? '',
    actorLabel: encodeOperatorInboxActorLabel({
      operatorNames,
      senderLabel: senderName ? withAccountBadgeLabel(senderName, senderBadge, language) : '',
      kind: activity.kind,
    }),
    recipientLanguage: language,
    ...(activity.kind === 'text' && activity.preview ? { messagePreview: activity.preview } : {}),
    conversationId: room.id,
    navigationUrl,
  }))
}

export async function notifyOperatorInboxActivity(activity: OperatorInboxActivity): Promise<void> {
  try {
    await notify(activity)
  } catch (error) {
    console.error('[operator-inbox] notify_failed', {
      kind: activity?.kind ?? null,
      error: error instanceof Error ? error.name : 'unknown',
    })
  }
}

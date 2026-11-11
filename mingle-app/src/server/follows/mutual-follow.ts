import { prisma } from '@/lib/prisma'
import { sendPushNotificationForUserNotification } from '@/server/push-notifications'

/**
 * Makes two accounts follow each other, as an accepted invite does: the person
 * who invited and the person who came in are friends from the first moment.
 * Each side gets one "follow" notification (and its push) for a follow that
 * did not exist before, unless they turned in-app notifications off. Nothing
 * happens between accounts where either blocked the other, or when one of them
 * is gone. Returns how many follows were new.
 */
export async function ensureMutualFollowBetween(firstUserId: string, secondUserId: string): Promise<number> {
  const first = firstUserId.trim()
  const second = secondUserId.trim()
  if (!first || !second || first === second) return 0

  const [users, block] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: [first, second] }, isActive: true, isDeleted: false },
      select: { id: true, inAppNotificationsEnabled: true },
    }),
    prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: first, blockedId: second },
          { blockerId: second, blockedId: first },
        ],
      },
      select: { id: true },
    }),
  ])
  if (users.length !== 2 || block) return 0
  const notificationsEnabled = new Map(users.map((user) => [user.id, user.inAppNotificationsEnabled !== false]))

  const created: string[] = []
  const notificationIds: string[] = []
  await prisma.$transaction(async (tx) => {
    for (const [followerId, followingId] of [[first, second], [second, first]] as const) {
      const existing = await tx.userFollow.findUnique({
        where: { followerId_followingId: { followerId, followingId } },
        select: { id: true },
      })
      if (existing) continue
      await tx.userFollow.create({ data: { followerId, followingId } })
      created.push(followerId)
      if (!notificationsEnabled.get(followingId)) continue
      const notification = await tx.userNotification.create({
        data: { recipientId: followingId, actorId: followerId, type: 'follow' },
        select: { id: true },
      })
      notificationIds.push(notification.id)
    }
  })

  for (const id of notificationIds) {
    try {
      await sendPushNotificationForUserNotification(id)
    } catch (error) {
      console.warn('[mutual-follow] push failed', error instanceof Error ? error.message : String(error))
    }
  }
  return created.length
}

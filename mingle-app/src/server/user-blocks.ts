import { prisma } from '@/lib/prisma'

/**
 * One account blocks another, the way the app's block button does: the
 * block row plus both follows removed. Idempotent. Used by the app route and
 * by staff blocking as an operator account from the admin inbox.
 */
export async function blockUser(blockerId: string, blockedId: string): Promise<void> {
  await prisma.$transaction([
    prisma.userBlock.upsert({
      where: { blockerId_blockedId: { blockerId, blockedId } },
      create: { blockerId, blockedId },
      update: {},
    }),
    prisma.userFollow.deleteMany({
      where: {
        OR: [
          { followerId: blockerId, followingId: blockedId },
          { followerId: blockedId, followingId: blockerId },
        ],
      },
    }),
  ])
}

export async function unblockUser(blockerId: string, blockedId: string): Promise<void> {
  await prisma.userBlock.deleteMany({ where: { blockerId, blockedId } })
}

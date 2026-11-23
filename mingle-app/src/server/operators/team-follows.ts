import { HAMZZI_USER_ID } from '@/lib/hamzzi'
import { prisma } from '@/lib/prisma'
import { ROYCE_USER_ID } from '@/lib/signup-welcome-onboarding'

const TEAM_USER_IDS = [ROYCE_USER_ID, HAMZZI_USER_ID]

/**
 * Operator accounts follow, and are followed by, both team accounts (@royce
 * and the mascot), the way every real person is at sign-up
 * (`signup-welcome-onboarding.ts`; staff, 2026-11-23: most operators had only
 * one of the two). Done when an account is created and, as a backfill, on
 * every engagement run. Rows only, no notifications or welcome messages.
 * Returns how many rows were added.
 */
export async function ensureOperatorTeamFollows(operatorIds: readonly string[]): Promise<number> {
  if (operatorIds.length === 0) return 0
  const team = (await prisma.user.findMany({
    where: { id: { in: TEAM_USER_IDS }, isDeleted: { not: true } },
    select: { id: true },
  })).map((user) => user.id)
  if (team.length === 0) return 0
  const existing = await prisma.userFollow.findMany({
    where: {
      OR: [
        { followerId: { in: [...operatorIds] }, followingId: { in: team } },
        { followerId: { in: team }, followingId: { in: [...operatorIds] } },
      ],
    },
    select: { followerId: true, followingId: true },
  })
  const have = new Set(existing.map((row) => `${row.followerId}>${row.followingId}`))
  const missing = operatorIds.flatMap((operatorId) => team.flatMap((teamId) => [
    { followerId: operatorId, followingId: teamId },
    { followerId: teamId, followingId: operatorId },
  ])).filter((row) => row.followerId !== row.followingId && !have.has(`${row.followerId}>${row.followingId}`))
  if (missing.length === 0) return 0
  const created = await prisma.userFollow.createMany({ data: missing, skipDuplicates: true })
  return created.count
}

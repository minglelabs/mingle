import { prisma } from '@/lib/prisma'
import { loadStarterFeed } from '@/server/feed/starter-feed'

/**
 * Operator accounts follow each other (staff 2026-11-24), mostly the
 * good-looking ones: a live account with no follows yet is given 2-13 accounts
 * to follow and a few followers of its own, picked by appeal. Only operator
 * accounts are involved; nobody is notified.
 */
type Random = () => number

export type FollowCandidate = { id: string; createdAt: Date; appeal: number }

/** How likely an account is to be followed. */
export function followAppeal(spec: unknown, starterAuthor: boolean): number {
  if (starterAuthor) return 6
  const grade = (spec as { attributes?: { attractiveness?: string } } | null)?.attributes?.attractiveness
  if (grade === 'striking') return 5
  if (grade === 'pleasant') return 1
  if (grade === 'ordinary') return 0.5
  return 0.8
}

/** Up to `count` distinct accounts from `pool`, by appeal. */
export function pickByAppeal(pool: readonly FollowCandidate[], count: number, random: Random): FollowCandidate[] {
  const left = [...pool]
  const picked: FollowCandidate[] = []
  while (picked.length < count && left.length) {
    let roll = random() * left.reduce((sum, candidate) => sum + candidate.appeal, 0)
    let index = left.length - 1
    for (let i = 0; i < left.length; i += 1) {
      roll -= left[i].appeal
      if (roll < 0) { index = i; break }
    }
    picked.push(left.splice(index, 1)[0])
  }
  return picked
}

/** A time between when both accounts existed and now. */
function followTime(a: Date, b: Date, now: Date, random: Random): Date {
  const earliest = Math.max(a.getTime(), b.getTime())
  return new Date(earliest + random() * Math.max(0, now.getTime() - earliest))
}

export const NEW_OPERATOR_FOLLOWS_PER_RUN = 5

/** Gives follows to live operator accounts that have none yet. Returns how many accounts got them. */
export async function followForNewOperators(now: Date = new Date(), random: Random = Math.random, limit: number = NEW_OPERATOR_FOLLOWS_PER_RUN): Promise<number> {
  const fresh = await prisma.user.findMany({
    where: {
      isOperator: true, isDeleted: false, isActive: true,
      operatorAccount: { reviewState: 'approved', personaCountry: { not: null } },
      followingRelations: { none: {} },
      followerRelations: { none: { follower: { isOperator: true } } },
    },
    select: { id: true, createdAt: true },
    take: limit,
  })
  if (fresh.length === 0) return 0
  const operators = await prisma.user.findMany({
    where: { isOperator: true, isDeleted: false, isActive: true, operatorAccount: { reviewState: 'approved', personaCountry: { not: null } } },
    select: { id: true, createdAt: true, operatorAccount: { select: { avatarSpec: true } } },
  })
  const feed = await loadStarterFeed()
  const starterIds = feed ? [...feed.ko, ...feed.foreign] : []
  const starterAuthors = new Set(starterIds.length ? (await prisma.post.findMany({ where: { id: { in: starterIds } }, select: { authorId: true } })).map((post) => post.authorId) : [])
  const candidates: FollowCandidate[] = operators.map((op) => ({ id: op.id, createdAt: op.createdAt, appeal: followAppeal(op.operatorAccount?.avatarSpec, starterAuthors.has(op.id)) }))
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]))

  const rows: Array<{ followerId: string; followingId: string; createdAt: Date }> = []
  for (const account of fresh) {
    const self = byId.get(account.id) ?? { id: account.id, createdAt: account.createdAt, appeal: 1 }
    const others = candidates.filter((candidate) => candidate.id !== account.id)
    for (const target of pickByAppeal(others, 2 + Math.floor(random() * 12), random)) {
      rows.push({ followerId: account.id, followingId: target.id, createdAt: followTime(account.createdAt, target.createdAt, now, random) })
    }
    // Followers: more for an appealing account, picked evenly among the others.
    const followers = Math.round((1 + random() * 3) * self.appeal)
    for (const follower of pickByAppeal(others.map((other) => ({ ...other, appeal: 1 })), followers, random)) {
      rows.push({ followerId: follower.id, followingId: account.id, createdAt: followTime(account.createdAt, follower.createdAt, now, random) })
    }
  }
  await prisma.userFollow.createMany({ data: rows, skipDuplicates: true })
  return fresh.length
}

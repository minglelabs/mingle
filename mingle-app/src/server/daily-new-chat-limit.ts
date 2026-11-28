import { prisma } from '@/lib/prisma'
import { ROYCE_USER_ID } from '@/lib/signup-welcome-onboarding'

// A man may start a 1:1 chat with three NEW women a day (owner, 2026-11-25;
// was one new person a day for everyone). Man to man, woman to woman and
// woman to man have no limit. Counted over the last
// 24 hours, from the rooms this account itself opened with exactly one other
// person. Not counted: a person there is already a room with (whoever opened
// it, so answering someone who wrote first is always free), the welcome
// account and the official HashChat account. Operator accounts count like
// anyone else (2026-11-16): most cards on a young home tab are theirs, and
// leaving them out would leave the limit with nothing to limit. An operator
// or official account doing the writing is never limited.
//
// DAILY_NEW_CHAT_LIMIT sets the number (default 3); 0 or "off" turns the
// limit off.

const DAY_MS = 24 * 60 * 60 * 1000
export const DEFAULT_DAILY_NEW_CHAT_LIMIT = 3

export function readDailyNewChatLimit(env: NodeJS.ProcessEnv = process.env): number | null {
  const raw = (env.DAILY_NEW_CHAT_LIMIT ?? '').trim().toLowerCase()
  if (!raw) return DEFAULT_DAILY_NEW_CHAT_LIMIT
  if (['0', 'off', 'false', 'no'].includes(raw)) return null
  const value = Number.parseInt(raw, 10)
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_DAILY_NEW_CHAT_LIMIT
}

export type OpenedRoom = { ownerUserId: string; memberUserIds: string[]; pendingInviteeUserIds: string[] }

/** The one other person of each 1:1 room the user opened; group and solo rooms count for nobody. */
export function newPeopleFromOpenedRooms(userId: string, rooms: OpenedRoom[], ignoredUserIds: readonly string[] = []): Set<string> {
  const people = new Set<string>()
  for (const room of rooms) {
    if (room.ownerUserId !== userId) continue
    const others = new Set([...room.memberUserIds, ...room.pendingInviteeUserIds].filter((id) => id && id !== userId))
    if (others.size !== 1) continue
    const [other] = [...others]
    if (!ignoredUserIds.includes(other)) people.add(other)
  }
  return people
}

/** Man to woman is the one limited direction (owner, 2026-11-25). */
export function isLimitedPair(senderGender: string | null | undefined, targetGender: string | null | undefined): boolean {
  return senderGender === 'male' && targetGender === 'female'
}

export type DailyNewChatCheck = { allowed: true } | { allowed: false; limit: number }

/**
 * Whether `userId` may open a first room with `targetUserId` now. The caller
 * runs this only when no room with that person exists yet.
 */
export async function checkDailyNewChatLimit(
  userId: string,
  targetUserId: string,
  options: { now?: Date; env?: NodeJS.ProcessEnv } = {},
): Promise<DailyNewChatCheck> {
  const limit = readDailyNewChatLimit(options.env)
  if (limit === null || targetUserId === ROYCE_USER_ID) return { allowed: true }
  const accounts = await prisma.user.findMany({
    where: { id: { in: [userId, targetUserId] } },
    select: { id: true, isOperator: true, isOfficial: true, gender: true },
  })
  const self = accounts.find((account) => account.id === userId)
  const target = accounts.find((account) => account.id === targetUserId)
  if (self?.isOperator || self?.isOfficial || target?.isOfficial) return { allowed: true }
  // Only a man writing to a woman is limited.
  if (!isLimitedPair(self?.gender, target?.gender)) return { allowed: true }

  const since = new Date((options.now ?? new Date()).getTime() - DAY_MS)
  const rooms = await prisma.appConversationChannel.findMany({
    where: { ownerUserId: userId, createdAt: { gte: since } },
    select: { ownerUserId: true, pendingInviteeUserIds: true, members: { select: { userId: true } } },
    take: 200,
  })
  const people = newPeopleFromOpenedRooms(
    userId,
    rooms.map((room) => ({ ownerUserId: room.ownerUserId, pendingInviteeUserIds: room.pendingInviteeUserIds, memberUserIds: room.members.map((member) => member.userId) })),
    [ROYCE_USER_ID],
  )
  // Opening a second room with someone already counted today costs nothing.
  if (people.has(targetUserId)) return { allowed: true }
  // Only women count; the official account written to today does not use up the day.
  if (people.size > 0) {
    const counted = await prisma.user.findMany({
      where: { id: { in: [...people] }, isOfficial: false, gender: 'female' },
      select: { id: true },
    })
    const countedIds = new Set(counted.map((account) => account.id))
    for (const id of [...people]) if (!countedIds.has(id)) people.delete(id)
  }
  return people.size >= limit ? { allowed: false, limit } : { allowed: true }
}

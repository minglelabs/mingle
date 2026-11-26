import { prisma } from '@/lib/prisma'
import { PHONE_HASH_PATTERN } from '@/lib/phone-number'
import { listHiddenContactHashes, rememberContactHashes } from '@/server/contact-avoid'

// Finding friends from the address book. The app sends sha256 hashes of its
// contacts' numbers (E.164, see @/lib/phone-number); the server answers which
// of them belong to HashChat accounts. The hashes are kept only for hiding
// from those people on the explore tab (src/server/contact-avoid.ts), unless
// the account turned that off. Phone numbers have few enough possibilities
// that a hash alone does not hide them, so the real guards are: only someone
// with a verified number of their own may ask, one ask is capped, and a
// match only reveals what a profile shows anyway.

/** Hashes in one request; the screen sends a large address book in parts. */
export const CONTACT_MATCH_MAX_HASHES = 1000

export type ContactMatch = {
  hash: string
  userId: string
  name: string | null
  handle: string
  image: string | null
  isFollowing: boolean
  /** The two do not see each other on the explore tab (see contact-avoid). */
  hidden: boolean
}

export type ContactMatchError = 'phone_not_verified' | 'too_many_hashes'

export class ContactMatchFailure extends Error {
  constructor(readonly code: ContactMatchError) {
    super(code)
  }
}

export function parseContactHashes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const hashes = new Set<string>()
  for (const value of raw) {
    if (typeof value !== 'string') continue
    const hash = value.trim().toLowerCase()
    if (PHONE_HASH_PATTERN.test(hash)) hashes.add(hash)
  }
  return [...hashes]
}

export async function matchContactHashes(userId: string, rawHashes: unknown): Promise<ContactMatch[]> {
  if (Array.isArray(rawHashes) && rawHashes.length > CONTACT_MATCH_MAX_HASHES) {
    throw new ContactMatchFailure('too_many_hashes')
  }
  const viewer = await prisma.user.findUnique({ where: { id: userId }, select: { phoneVerifiedAt: true, phoneHash: true } })
  if (!viewer?.phoneVerifiedAt) throw new ContactMatchFailure('phone_not_verified')
  const hashes = parseContactHashes(rawHashes).filter((hash) => hash !== viewer.phoneHash)
  if (hashes.length === 0) return []
  await rememberContactHashes(userId, hashes)

  const users = await prisma.user.findMany({
    where: {
      phoneHash: { in: hashes },
      phoneVerifiedAt: { not: null },
      isActive: true,
      isDeleted: false,
      isOperator: false,
      id: { not: userId },
      blockingRelations: { none: { blockedId: userId } },
      blockedByRelations: { none: { blockerId: userId } },
    },
    select: { id: true, name: true, handle: true, image: true, phoneHash: true },
  })
  if (users.length === 0) return []

  const follows = await prisma.userFollow.findMany({
    where: { followerId: userId, followingId: { in: users.map((user) => user.id) } },
    select: { followingId: true },
  })
  const following = new Set(follows.map((follow) => follow.followingId))
  const hiddenHashes = await listHiddenContactHashes(userId, users.flatMap((user) => (user.phoneHash ? [user.phoneHash] : [])))
  return users
    .filter((user): user is typeof user & { phoneHash: string } => Boolean(user.phoneHash))
    .map((user) => ({
      hash: user.phoneHash,
      userId: user.id,
      name: user.name,
      handle: user.handle,
      image: user.image,
      isFollowing: following.has(user.id),
      hidden: hiddenHashes.has(user.phoneHash),
    }))
}

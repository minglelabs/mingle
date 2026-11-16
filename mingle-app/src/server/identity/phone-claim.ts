import { createHash } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { ROYCE_USER_ID } from '@/lib/signup-welcome-onboarding'
import { identityKeyHash, identityMethodForProvider } from '@/server/identity/keys'
import { isIdentityBlocked, recordIdentityLink, type RequestIdentityContext } from '@/server/identity/links'

// What happens once a number is proved by an account that is already signed
// in (docs/one-account-per-person.md, section 5). A number never moves:
//
//  - nobody has it                     → it becomes this account's number
//  - another account has it            → an empty new account is folded into
//                                        that account ("switch"); an account
//                                        with a history is told "in use"
//  - new number on a device that has   → an empty new account is folded into
//    an account already (strong          the device's account; the number is
//    device values only)                 saved as that account's own (it had
//                                        none) or attached as an extra one
//  - a ban closed the number           → refused

const NEW_ACCOUNT_WINDOW_MS = 24 * 60 * 60 * 1000

export type PhoneClaimDecision =
  | { kind: 'blocked' }
  | { kind: 'claim' }
  | { kind: 'in_use'; ownerUserId: string }
  | { kind: 'switch'; toUserId: string; phone: 'keep' | 'set_own' | 'attach' }

export type PhoneClaimFacts = {
  selfId: string
  /** Made by this sign-in and never used: see isEmptyAccount. */
  selfEmpty: boolean
  /** Staff, official and store-review accounts are never folded by device. */
  selfExempt: boolean
  blocked: boolean
  /** The live account holding the number, as its own or as an attached one. */
  numberOwnerId: string | null
  /** The first live account seen on this (strong, not exempt) device, other than this one. */
  deviceOwner: { userId: string; hasOwnPhone: boolean } | null
}

export function decidePhoneClaim(facts: PhoneClaimFacts): PhoneClaimDecision {
  if (facts.blocked) return { kind: 'blocked' }
  if (facts.numberOwnerId && facts.numberOwnerId !== facts.selfId) {
    return facts.selfEmpty
      ? { kind: 'switch', toUserId: facts.numberOwnerId, phone: 'keep' }
      : { kind: 'in_use', ownerUserId: facts.numberOwnerId }
  }
  if (!facts.numberOwnerId && facts.deviceOwner && facts.selfEmpty && !facts.selfExempt) {
    return { kind: 'switch', toUserId: facts.deviceOwner.userId, phone: facts.deviceOwner.hasOwnPhone ? 'attach' : 'set_own' }
  }
  return { kind: 'claim' }
}

/** sha256 of the number, as friends' apps hash their contacts (User.phoneHash). */
function contactPhoneHash(phoneE164: string): string {
  return createHash('sha256').update(phoneE164).digest('hex')
}

const LIVE_USER = { isDeleted: false, bannedAt: null, mergedIntoUserId: null } as const

/** The live account that holds the number, as its own or as an attached one. */
export async function findPhoneOwnerId(phoneE164: string): Promise<string | null> {
  const own = await prisma.user.findFirst({ where: { phoneE164, ...LIVE_USER }, select: { id: true } })
  if (own) return own.id
  const attached = await prisma.appUserPhone.findUnique({
    where: { phoneKeyHash: identityKeyHash('phone', phoneE164) },
    select: { userId: true },
  })
  if (!attached) return null
  const owner = await prisma.user.findFirst({ where: { id: attached.userId, ...LIVE_USER }, select: { id: true } })
  return owner?.id ?? null
}

/**
 * An account made by this very sign-in and never used: at most a day old, no
 * password of its own, no invite accepted, no message, post or purchase, and
 * following nobody but the welcome account.
 */
export async function isEmptyAccount(userId: string, now: Date = new Date()): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { createdAt: true, passwordHash: true, referredByUserId: true, isOperator: true, isOfficial: true },
  })
  if (!user) return false
  if (now.getTime() - user.createdAt.getTime() > NEW_ACCOUNT_WINDOW_MS) return false
  if (user.passwordHash || user.referredByUserId || user.isOperator || user.isOfficial) return false
  const [messages, posts, follows, purchases] = await Promise.all([
    prisma.appMessage.count({ where: { userId } }),
    prisma.post.count({ where: { authorId: userId } }),
    prisma.userFollow.count({ where: { followerId: userId, followingId: { not: ROYCE_USER_ID } } }),
    prisma.appIapPurchase.count({ where: { userId } }),
  ])
  return messages + posts + follows + purchases === 0
}

/** The first live, ordinary account seen on the device, other than `selfId`. */
async function findDeviceOwner(deviceId: string, selfId: string): Promise<PhoneClaimFacts['deviceOwner']> {
  const rows = await prisma.appDeviceUser.findMany({
    where: { deviceId, userId: { not: selfId } },
    orderBy: { firstSeenAt: 'asc' },
    select: { userId: true },
    take: 20,
  })
  if (rows.length === 0) return null
  const users = await prisma.user.findMany({
    where: { id: { in: rows.map((row) => row.userId) }, ...LIVE_USER, isOperator: false, isOfficial: false },
    select: { id: true, phoneE164: true },
  })
  const byId = new Map(users.map((user) => [user.id, user]))
  for (const row of rows) {
    const user = byId.get(row.userId)
    if (user) return { userId: user.id, hasOwnPhone: Boolean(user.phoneE164) }
  }
  return null
}

export type PhoneClaimResult = { phoneE164: string; switchedTo?: string }

export class PhoneClaimRefused extends Error {
  constructor(readonly code: 'phone_in_use' | 'blocked') {
    super(code)
  }
}

/** Folds the empty account `selfId` into `toUserId`: its sign-in methods and push tokens move, and the row stays as a pointer. */
async function foldAccountInto(input: {
  selfId: string
  toUserId: string
  phoneE164: string
  phone: 'keep' | 'set_own' | 'attach'
  context?: RequestIdentityContext
}): Promise<void> {
  const { selfId, toUserId, phoneE164 } = input
  const now = new Date()
  const phoneKeyHash = identityKeyHash('phone', phoneE164)
  const accounts = await prisma.account.findMany({ where: { userId: selfId }, select: { provider: true, providerAccountId: true } })
  await prisma.$transaction(async (tx) => {
    await tx.account.updateMany({ where: { userId: selfId }, data: { userId: toUserId } })
    await tx.userPushToken.updateMany({ where: { userId: selfId }, data: { userId: toUserId } })
    await tx.user.update({
      where: { id: selfId },
      data: {
        isDeleted: true,
        deletedAt: now,
        isActive: false,
        email: `__merged_${selfId}@mingle.internal`,
        passwordHash: null,
        externalUserId: null,
        phoneE164: null,
        phoneHash: null,
        phoneVerifiedAt: null,
        mergedIntoUserId: toUserId,
        mergedAt: now,
      },
    })
    if (input.phone === 'set_own') {
      await tx.user.update({
        where: { id: toUserId },
        data: { phoneE164, phoneHash: contactPhoneHash(phoneE164), phoneVerifiedAt: now },
      })
    }
    if (input.phone === 'attach') {
      await tx.appUserPhone.upsert({
        where: { phoneKeyHash },
        create: { userId: toUserId, phoneKeyHash, last4: phoneE164.slice(-4), attachedViaDeviceId: input.context?.device?.id ?? null, verifiedAt: now },
        update: {},
      })
    }
  })
  const context = input.context
  await recordIdentityLink({ userId: selfId, method: 'phone', rawKey: phoneE164, event: 'merged', context })
  await recordIdentityLink({ userId: toUserId, method: 'phone', rawKey: phoneE164, event: input.phone === 'attach' ? 'attached' : 'phone_verified', context })
  for (const account of accounts) {
    const method = identityMethodForProvider(account.provider)
    if (method) await recordIdentityLink({ userId: toUserId, method, rawKey: account.providerAccountId, event: 'attached', context })
  }
}

/**
 * Called once the code is proved. Saves the number on the account, or folds
 * the account into the one the number (or the device) already belongs to.
 * Throws PhoneClaimRefused when the number is in use by another account with
 * a history, or closed by a ban.
 */
export async function claimVerifiedPhone(
  userId: string,
  phoneE164: string,
  options: { context?: RequestIdentityContext; selfExempt?: boolean } = {},
): Promise<PhoneClaimResult> {
  const context = options.context
  const device = context?.device
  const blocked = (await isIdentityBlocked('phone', phoneE164)) || Boolean(device?.blocked)
  const numberOwnerId = blocked ? null : await findPhoneOwnerId(phoneE164)
  const deviceApplies = Boolean(device && device.strong && !device.exempt)
  // The count queries run only when folding is possible at all.
  const mayFold = !blocked && ((numberOwnerId !== null && numberOwnerId !== userId) || (numberOwnerId === null && deviceApplies))
  const selfEmpty = mayFold ? await isEmptyAccount(userId) : false
  const deviceOwner = !blocked && numberOwnerId === null && deviceApplies && selfEmpty && device
    ? await findDeviceOwner(device.id, userId)
    : null

  const decision = decidePhoneClaim({
    selfId: userId,
    selfEmpty,
    selfExempt: Boolean(options.selfExempt),
    blocked,
    numberOwnerId,
    deviceOwner,
  })

  if (decision.kind === 'blocked') throw new PhoneClaimRefused('blocked')
  if (decision.kind === 'in_use') {
    // Both accounts are now known to share the number: same bundle.
    await recordIdentityLink({ userId, method: 'phone', rawKey: phoneE164, event: 'phone_in_use', context })
    throw new PhoneClaimRefused('phone_in_use')
  }
  if (decision.kind === 'switch') {
    await foldAccountInto({ selfId: userId, toUserId: decision.toUserId, phoneE164, phone: decision.phone, context })
    return { phoneE164, switchedTo: decision.toUserId }
  }

  const now = new Date()
  await prisma.$transaction([
    // The number may have been one of this account's extra numbers; it is its own now.
    prisma.appUserPhone.deleteMany({ where: { userId, phoneKeyHash: identityKeyHash('phone', phoneE164) } }),
    // A deleted or banned account may still hold the number: the column is unique.
    prisma.user.updateMany({
      where: { phoneE164, id: { not: userId } },
      data: { phoneE164: null, phoneHash: null, phoneVerifiedAt: null },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { phoneE164, phoneHash: contactPhoneHash(phoneE164), phoneVerifiedAt: now },
    }),
  ])
  if (device) {
    await prisma.appDevicePhone.upsert({
      where: { deviceId_phoneKeyHash: { deviceId: device.id, phoneKeyHash: identityKeyHash('phone', phoneE164) } },
      create: { deviceId: device.id, phoneKeyHash: identityKeyHash('phone', phoneE164), verifiedAt: now },
      update: { verifiedAt: now },
    }).catch(() => null)
  }
  await recordIdentityLink({ userId, method: 'phone', rawKey: phoneE164, event: 'phone_verified', context })
  return { phoneE164 }
}

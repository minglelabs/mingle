import { randomInt } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { coinsToMicro } from '@/lib/coin-units'
import { generateReferralCode, normalizeReferralCode, REFERRAL_REWARD_COINS } from '@/lib/referral-code'
import { grantLot, hasLedgerEntry, withLockedWallet } from '@/server/coins/ledger'

// Invite codes: each user has one code; a user may enter one other person's
// code once, and both then get REFERRAL_REWARD_COINS free coins.

const CODE_ATTEMPTS = 8

export type ReferralState = {
  code: string
  rewardCoins: number
  // This user already entered someone's code.
  redeemed: boolean
  // How many people entered this user's code.
  invitedCount: number
  // The contact-sync screen has not opened by itself for this user yet.
  shouldPromptContactSync: boolean
}

export type ReferralRedeemError = 'invalid_code' | 'not_found' | 'own_code' | 'already_redeemed' | 'not_allowed'

export class ReferralError extends Error {
  constructor(readonly code: ReferralRedeemError) {
    super(code)
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002'
}

/** The user's code, made on first use. */
export async function ensureReferralCode(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { referralCode: true } })
  if (!user) throw new ReferralError('not_allowed')
  if (user.referralCode) return user.referralCode
  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
    const code = generateReferralCode(() => randomInt(0, 1_000_000) / 1_000_000)
    try {
      // Only fills an empty slot, so two requests at once end on the same code.
      const { count } = await prisma.user.updateMany({ where: { id: userId, referralCode: null }, data: { referralCode: code } })
      if (count === 1) return code
      const current = await prisma.user.findUnique({ where: { id: userId }, select: { referralCode: true } })
      if (current?.referralCode) return current.referralCode
    } catch (error) {
      // Someone else has this code: try another.
      if (!isUniqueViolation(error)) throw error
    }
  }
  throw new Error('referral_code_generation_failed')
}

export async function getReferralState(userId: string): Promise<ReferralState> {
  const [code, user, invitedCount] = await Promise.all([
    ensureReferralCode(userId),
    prisma.user.findUnique({ where: { id: userId }, select: { referredByUserId: true, contactSyncPromptedAt: true } }),
    prisma.user.count({ where: { referredByUserId: userId } }),
  ])
  return {
    code,
    rewardCoins: REFERRAL_REWARD_COINS,
    redeemed: Boolean(user?.referredByUserId),
    invitedCount,
    shouldPromptContactSync: Boolean(user) && !user?.contactSyncPromptedAt,
  }
}

export async function markContactSyncPrompted(userId: string): Promise<void> {
  await prisma.user.updateMany({
    where: { id: userId, contactSyncPromptedAt: null },
    data: { contactSyncPromptedAt: new Date() },
  })
}

async function grantReferralCoins(userId: string, idempotencyKey: string, meta: { role: 'invitee' | 'inviter'; otherUserId: string }) {
  await withLockedWallet(userId, async (ctx) => {
    if (await hasLedgerEntry(ctx, idempotencyKey)) return
    await grantLot(ctx, {
      source: 'referral',
      isFree: true,
      amountMicro: coinsToMicro(REFERRAL_REWARD_COINS),
      idempotencyKey,
      meta,
    })
  })
}

/**
 * Enters someone's invite code for userId and pays both sides. A user can do
 * this once; the ledger keys make a repeated or retried call pay nothing more.
 */
export async function redeemReferralCode(userId: string, rawCode: unknown): Promise<{ rewardCoins: number }> {
  const code = normalizeReferralCode(rawCode)
  if (!code) throw new ReferralError('invalid_code')

  const [user, inviter] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, referredByUserId: true, isOperator: true, isOfficial: true, isDeleted: true },
    }),
    prisma.user.findUnique({
      where: { referralCode: code },
      select: { id: true, referredByUserId: true, isDeleted: true, withdrawnAt: true },
    }),
  ])
  if (!user || user.isDeleted || user.isOperator || user.isOfficial) throw new ReferralError('not_allowed')
  if (user.referredByUserId) throw new ReferralError('already_redeemed')
  if (!inviter || inviter.isDeleted || inviter.withdrawnAt) throw new ReferralError('not_found')
  if (inviter.id === userId) throw new ReferralError('own_code')
  // Two people entering each other's code would pay the pair twice.
  if (inviter.referredByUserId === userId) throw new ReferralError('not_allowed')

  const claimed = await prisma.user.updateMany({
    where: { id: userId, referredByUserId: null },
    data: { referredByUserId: inviter.id, referredAt: new Date() },
  })
  if (claimed.count !== 1) throw new ReferralError('already_redeemed')

  try {
    await grantReferralCoins(userId, `referral:invitee:${userId}`, { role: 'invitee', otherUserId: inviter.id })
    await grantReferralCoins(inviter.id, `referral:inviter:${inviter.id}:${userId}`, { role: 'inviter', otherUserId: userId })
  } catch (error) {
    // Let the person try again; whatever was already paid is not paid twice.
    await prisma.user.updateMany({
      where: { id: userId, referredByUserId: inviter.id },
      data: { referredByUserId: null, referredAt: null },
    }).catch(() => {})
    throw error
  }
  return { rewardCoins: REFERRAL_REWARD_COINS }
}

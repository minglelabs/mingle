import { createHash, randomInt } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { coinsToMicro } from '@/lib/coin-units'
import { findOrCreateDirectConversation } from '@/lib/app-conversations'
import { captureMingleEvent } from '@/lib/posthog-server'
import { ensureMutualFollowBetween } from '@/server/follows/mutual-follow'
import { generateReferralCode, normalizeReferralCode, type InviteSource } from '@/lib/referral-code'
import { resolveUsagePurposeSegmentationDefaults } from '@/lib/usage-purpose'
import { grantLot, hasLedgerEntry, withLockedWallet } from '@/server/coins/ledger'

// Invites. Each user has one invite code; it is also their invite-ticket link
// (/i/{code}). A user may accept one other person's invite once: by tapping
// the link, through the Play install referrer, or by typing the code. Both
// then get the join reward, follow each other, and a 1:1 room between the
// two is opened.

const CODE_ATTEMPTS = 8
const RECHAT_MIN_GAP_MS = 12 * 60 * 60 * 1000
const RECHAT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

function readCoinsEnv(raw: string | undefined, fallback: number): number {
  const value = Number((raw ?? '').trim())
  return (raw ?? '').trim() !== '' && Number.isInteger(value) && value >= 0 && value <= 1_000_000 ? value : fallback
}

/**
 * Coins each side gets when an invite is accepted. PROVISIONAL: 1,000.
 * Change with COIN_INVITE_JOIN_COINS (0 turns it off).
 */
export function resolveInviteJoinRewardCoins(raw: string | undefined = process.env.COIN_INVITE_JOIN_COINS): number {
  return readCoinsEnv(raw, 1_000)
}

/**
 * Extra coins each side gets when the invited pair first talk in one room.
 * PROVISIONAL: 0 (off). Change with COIN_INVITE_FIRST_CHAT_COINS.
 */
export function resolveInviteFirstChatRewardCoins(raw: string | undefined = process.env.COIN_INVITE_FIRST_CHAT_COINS): number {
  return readCoinsEnv(raw, 0)
}

export type ReferralState = {
  code: string
  rewardCoins: number
  // This user already accepted someone's invite.
  redeemed: boolean
  // How many people accepted this user's invite.
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

/** The inviter and the invited follow each other; a failure never undoes the invite. */
async function followEachOther(userId: string, inviterUserId: string): Promise<void> {
  try {
    await ensureMutualFollowBetween(userId, inviterUserId)
  } catch (error) {
    console.warn('[invite] mutual_follow_failed', error instanceof Error ? error.message : String(error))
  }
}

/** PostHog never gets an account id: the tracking id, or a digest when there is none. */
function analyticsId(user: { id: string; externalUserId?: string | null }): string {
  return user.externalUserId?.trim() || createHash('sha256').update(user.id).digest('hex')
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex')
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
    rewardCoins: resolveInviteJoinRewardCoins(),
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

/** The person behind an invite link, for the landing page. null = no such invite. */
export async function getInviteTicketInviter(rawCode: unknown) {
  const code = normalizeReferralCode(rawCode)
  if (!code) return null
  const inviter = await prisma.user.findUnique({
    where: { referralCode: code },
    select: {
      id: true, name: true, image: true, imageCropScale: true, imageCropX: true, imageCropY: true,
      isDeleted: true, withdrawnAt: true, isActive: true,
    },
  })
  if (!inviter || inviter.isDeleted || inviter.withdrawnAt || !inviter.isActive) return null
  return { code, inviter }
}

async function grantInviteCoins(
  userId: string,
  coins: number,
  idempotencyKey: string,
  meta: { role: 'invitee' | 'inviter'; otherUserId: string; reason: 'join' | 'first_chat' },
) {
  if (coins <= 0) return
  await withLockedWallet(userId, async (ctx) => {
    if (await hasLedgerEntry(ctx, idempotencyKey)) return
    await grantLot(ctx, {
      source: 'referral',
      isFree: true,
      amountMicro: coinsToMicro(coins),
      idempotencyKey,
      meta,
    })
  })
}

/**
 * Accepts someone's invite for userId and pays both sides the join reward. A
 * user can do this once; the ledger keys make a repeated or retried call pay
 * nothing more. Someone who came through an invite is here to chat, so an
 * unset usage purpose becomes "social" and an unset discovery source "friend".
 */
export async function redeemReferralCode(
  userId: string,
  rawCode: unknown,
  options: { source?: InviteSource } = {},
): Promise<{ rewardCoins: number; inviterUserId: string }> {
  const code = normalizeReferralCode(rawCode)
  if (!code) throw new ReferralError('invalid_code')
  const source = options.source ?? 'code'

  const [user, inviter] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, externalUserId: true, referredByUserId: true, isOperator: true, isOfficial: true, isDeleted: true,
        usagePurpose: true, discoverySource: true,
      },
    }),
    prisma.user.findUnique({
      where: { referralCode: code },
      select: { id: true, externalUserId: true, referredByUserId: true, isDeleted: true, withdrawnAt: true },
    }),
  ])
  if (!user || user.isDeleted || user.isOperator || user.isOfficial) throw new ReferralError('not_allowed')
  if (!inviter || inviter.isDeleted || inviter.withdrawnAt) throw new ReferralError('not_found')
  if (inviter.id === userId) throw new ReferralError('own_code')
  if (user.referredByUserId) throw new ReferralError('already_redeemed')
  // Two people accepting each other's invite would pay the pair twice.
  if (inviter.referredByUserId === userId) throw new ReferralError('not_allowed')

  const claimed = await prisma.user.updateMany({
    where: { id: userId, referredByUserId: null },
    data: {
      referredByUserId: inviter.id,
      referredAt: new Date(),
      referralSource: source,
      ...(user.usagePurpose ? {} : { usagePurpose: 'social', ...resolveUsagePurposeSegmentationDefaults('social') }),
      ...(user.discoverySource ? {} : { discoverySource: 'friend' }),
    },
  })
  if (claimed.count !== 1) throw new ReferralError('already_redeemed')

  const rewardCoins = resolveInviteJoinRewardCoins()
  try {
    await grantInviteCoins(userId, rewardCoins, `referral:invitee:${userId}`, { role: 'invitee', otherUserId: inviter.id, reason: 'join' })
    await grantInviteCoins(inviter.id, rewardCoins, `referral:inviter:${inviter.id}:${userId}`, { role: 'inviter', otherUserId: userId, reason: 'join' })
  } catch (error) {
    // Let the person try again; whatever was already paid is not paid twice.
    await prisma.user.updateMany({
      where: { id: userId, referredByUserId: inviter.id },
      data: { referredByUserId: null, referredAt: null, referralSource: null },
    }).catch(() => {})
    throw error
  }
  captureMingleEvent({
    distinctId: analyticsId(user),
    event: 'mingle_invite_accepted',
    properties: { invite_source: source, reward_coins: rewardCoins, inviter_digest: digest(inviter.id) },
  })
  await followEachOther(userId, inviter.id)
  return { rewardCoins, inviterUserId: inviter.id }
}

export type InviteAcceptResult = {
  // false: this account had already accepted an invite (or may not), so nothing was paid.
  rewarded: boolean
  rewardCoins: number
  // The 1:1 room with the inviter. null when it could not be opened (e.g. a block).
  conversationId: string | null
  inviterName: string | null
}

/**
 * What tapping an invite link (or the install referrer) does: accept the
 * invite if this account still can, and open the 1:1 room with the inviter
 * either way. Only a bad, unknown or own code is an error.
 */
export async function acceptInvite(
  userId: string,
  rawCode: unknown,
  options: { source?: InviteSource; locale?: string } = {},
): Promise<InviteAcceptResult> {
  const ticket = await getInviteTicketInviter(rawCode)
  if (!normalizeReferralCode(rawCode)) throw new ReferralError('invalid_code')
  if (!ticket) throw new ReferralError('not_found')
  if (ticket.inviter.id === userId) throw new ReferralError('own_code')

  let rewarded = false
  let rewardCoins = 0
  try {
    rewardCoins = (await redeemReferralCode(userId, ticket.code, { source: options.source })).rewardCoins
    rewarded = true
  } catch (error) {
    if (!(error instanceof ReferralError) || (error.code !== 'already_redeemed' && error.code !== 'not_allowed')) throw error
  }

  // A link tap is a wish to talk to this person even when the account had
  // already accepted an invite, so the follows are made either way.
  await followEachOther(userId, ticket.inviter.id)

  let conversationId: string | null = null
  try {
    const { conversation } = await findOrCreateDirectConversation({
      userId,
      targetUserId: ticket.inviter.id,
      locale: options.locale,
    })
    conversationId = conversation.id
  } catch (error) {
    console.warn('[invite] room_open_failed', error instanceof Error ? error.message : String(error))
  }
  return { rewarded, rewardCoins, conversationId, inviterName: ticket.inviter.name }
}

/**
 * Called after a message is stored. For an invited pair it notices the first
 * time both have written in one room (pays the first-chat bonus, sends
 * mingle_invite_first_chat) and the first time they talk again 12 hours to 7
 * days later (mingle_invite_rechat_7d). Never throws.
 */
export async function noteInvitePairMessage(args: { userId: string; messageId: string | null | undefined; now?: Date }): Promise<void> {
  if (!args.userId || !args.messageId) return
  const now = args.now ?? new Date()
  try {
    // The invitee row carries the pair's state: the sender is either the invitee or the inviter.
    const invitees = await prisma.user.findMany({
      where: {
        referralRechatAt: null,
        referredAt: { not: null },
        OR: [{ id: args.userId, referredByUserId: { not: null } }, { referredByUserId: args.userId }],
      },
      select: { id: true, externalUserId: true, referredByUserId: true, referralFirstChatAt: true },
      take: 50,
    })
    // Almost every message stops here: the sender is in no open invite pair.
    if (invitees.length === 0) return
    const message = await prisma.appMessage.findUnique({ where: { id: args.messageId }, select: { sessionKey: true } })
    const sessionKey = message?.sessionKey?.trim()
    if (!sessionKey) return
    for (const invitee of invitees) {
      const inviterId = invitee.referredByUserId
      if (!inviterId) continue
      const otherUserId = invitee.id === args.userId ? inviterId : invitee.id
      if (invitee.referralFirstChatAt) {
        const elapsed = now.getTime() - invitee.referralFirstChatAt.getTime()
        if (elapsed < RECHAT_MIN_GAP_MS || elapsed > RECHAT_WINDOW_MS) continue
        if (!(await prisma.appMessage.findFirst({ where: { sessionKey, userId: otherUserId }, select: { id: true } }))) continue
        const marked = await prisma.user.updateMany({ where: { id: invitee.id, referralRechatAt: null }, data: { referralRechatAt: now } })
        if (marked.count !== 1) continue
        captureMingleEvent({
          distinctId: analyticsId(invitee),
          event: 'mingle_invite_rechat_7d',
          properties: { inviter_digest: digest(inviterId), hours_since_first_chat: Math.round(elapsed / 3_600_000) },
        })
        continue
      }
      // First chat: the other one has already written in this same room.
      if (!(await prisma.appMessage.findFirst({ where: { sessionKey, userId: otherUserId }, select: { id: true } }))) continue
      const marked = await prisma.user.updateMany({ where: { id: invitee.id, referralFirstChatAt: null }, data: { referralFirstChatAt: now } })
      if (marked.count !== 1) continue
      const bonusCoins = resolveInviteFirstChatRewardCoins()
      await grantInviteCoins(invitee.id, bonusCoins, `referral:first-chat:invitee:${invitee.id}`, { role: 'invitee', otherUserId: inviterId, reason: 'first_chat' })
      await grantInviteCoins(inviterId, bonusCoins, `referral:first-chat:inviter:${inviterId}:${invitee.id}`, { role: 'inviter', otherUserId: invitee.id, reason: 'first_chat' })
      captureMingleEvent({
        distinctId: analyticsId(invitee),
        event: 'mingle_invite_first_chat',
        properties: { inviter_digest: digest(inviterId), bonus_coins: bonusCoins },
      })
    }
  } catch (error) {
    console.warn('[invite] pair_message_failed', error instanceof Error ? error.message : String(error))
  }
}

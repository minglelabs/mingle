import { coinsToMicro, MICRO_PER_COIN } from '@/lib/coin-units'
import { prisma } from '@/lib/prisma'
import { ROYCE_USER_ID } from '@/lib/signup-welcome-onboarding'
import { resolveUserCoinBillingMode } from '@/server/coins/config'
import { grantLot, takeFromLots, withLockedWallet } from '@/server/coins/ledger'
import { getCoinWallet } from '@/server/coins/wallet'
import { isLimitedPair } from '@/server/daily-new-chat-limit'

// Opening a new 1:1 room costs a man 500 Hash when the other person is a
// woman (owner, 2026-11-26), on top of the three-a-day limit
// (@/server/daily-new-chat-limit), in the same direction only. Free when she
// follows him, when a room with her already exists (whoever opened it), for
// operator and official accounts, and to the official and welcome accounts.
// If she has written nothing in the room 48 hours later, the Hash goes back,
// to the same kind it came from (bought Hash stays bought). Given back the
// next time he opens the app or reads his wallet; no job runs for it.
//
// DM_OPEN_COINS (default 500; 0 or "off" turns it off) and
// DM_OPEN_REFUND_HOURS (default 48) set the numbers.

export const DM_OPEN_SPEND_SOURCE = 'dm_open'
export const DM_OPEN_REFUND_SOURCE = 'dm_open_refund'
const SETTLE_BATCH = 20

export function readDmOpenCoins(env: NodeJS.ProcessEnv = process.env): number | null {
  const raw = (env.DM_OPEN_COINS ?? '').trim().toLowerCase()
  if (!raw) return 500
  if (['0', 'off', 'false', 'no'].includes(raw)) return null
  const coins = Number.parseInt(raw, 10)
  return Number.isFinite(coins) && coins > 0 ? coins : 500
}

export function readDmOpenRefundHours(env: NodeJS.ProcessEnv = process.env): number {
  const hours = Number.parseInt((env.DM_OPEN_REFUND_HOURS ?? '').trim(), 10)
  return Number.isFinite(hours) && hours > 0 ? hours : 48
}

export type DmOpenQuote = { coins: number; refundHours: number; balance: number }

/**
 * What opening a first room with `targetUserId` costs `userId`, or null when
 * it is free. The caller asks only when no room with that person exists yet.
 */
export async function quoteDmOpen(userId: string, targetUserId: string): Promise<DmOpenQuote | null> {
  const coins = readDmOpenCoins()
  if (coins === null || !userId || targetUserId === ROYCE_USER_ID) return null
  if (resolveUserCoinBillingMode(userId) !== 'enforce') return null
  const accounts = await prisma.user.findMany({
    where: { id: { in: [userId, targetUserId] } },
    select: { id: true, isOperator: true, isOfficial: true, gender: true },
  })
  const self = accounts.find((account) => account.id === userId)
  const target = accounts.find((account) => account.id === targetUserId)
  if (!self || !target || self.isOperator || self.isOfficial || target.isOfficial) return null
  if (!isLimitedPair(self.gender, target.gender)) return null
  const followsHim = await prisma.userFollow.findFirst({ where: { followerId: targetUserId, followingId: userId }, select: { id: true } })
  if (followsHim) return null
  const wallet = await getCoinWallet(userId)
  return { coins, refundHours: readDmOpenRefundHours(), balance: wallet.balance }
}

/** Takes the price for the room just opened. Once per room; a retry takes nothing more. */
export async function chargeDmOpen(input: { userId: string; targetUserId: string; channelId: string; coins: number; now?: Date }): Promise<void> {
  const now = input.now ?? new Date()
  const key = `dm-open:${input.channelId}`
  await withLockedWallet(input.userId, async (ctx) => {
    const existing = await ctx.tx.dmOpenCharge.findUnique({ where: { channelId: input.channelId }, select: { id: true } })
    if (existing) return
    const spent = await takeFromLots(ctx, {
      type: 'spend',
      amountMicro: coinsToMicro(input.coins),
      idempotencyKey: key,
      meta: { kind: DM_OPEN_SPEND_SOURCE, channelId: input.channelId, targetUserId: input.targetUserId },
    })
    if (spent.spentMicro <= 0n) return
    await ctx.tx.dmOpenCharge.create({
      data: {
        channelId: input.channelId,
        senderUserId: input.userId,
        targetUserId: input.targetUserId,
        chargedMicro: spent.spentMicro,
        refundDueAt: new Date(now.getTime() + readDmOpenRefundHours() * 60 * 60 * 1000),
        createdAt: now,
      },
    })
  }, { now })
}

/**
 * Looks at this man's rooms whose wait is over: answered ones are closed,
 * unanswered ones get their Hash back. Returns what came back.
 */
export async function settleDmOpenCharges(userId: string, now: Date = new Date()): Promise<{ refundedCoins: number; rooms: number }> {
  const due = await prisma.dmOpenCharge.findMany({
    where: { senderUserId: userId, settledAt: null, refundDueAt: { lte: now } },
    orderBy: { refundDueAt: 'asc' },
    take: SETTLE_BATCH,
  })
  let refundedMicro = 0n
  let rooms = 0
  for (const charge of due) {
    const channel = await prisma.appConversationChannel.findUnique({ where: { id: charge.channelId }, select: { sessionKey: true } })
    const answered = channel
      ? await prisma.appMessage.findFirst({
        where: { sessionKey: channel.sessionKey, userId: charge.targetUserId, createdAt: { lte: charge.refundDueAt } },
        select: { id: true },
      })
      : null
    if (answered) {
      await prisma.dmOpenCharge.updateMany({ where: { id: charge.id, settledAt: null }, data: { settledAt: now, outcome: 'answered' } })
      continue
    }
    const back = await refundCharge(charge.id, userId, now)
    if (back > 0n) {
      refundedMicro += back
      rooms += 1
    }
  }
  return { refundedCoins: Number(refundedMicro / MICRO_PER_COIN), rooms }
}

/** Gives one charge back, as free and bought Hash in the amounts it took of each. */
async function refundCharge(chargeId: string, userId: string, now: Date): Promise<bigint> {
  return withLockedWallet(userId, async (ctx) => {
    const charge = await ctx.tx.dmOpenCharge.findUnique({ where: { id: chargeId } })
    if (!charge || charge.settledAt) return 0n
    const spend = await ctx.tx.appCoinLedger.findUnique({ where: { idempotencyKey: `dm-open:${charge.channelId}` }, select: { id: true } })
    const allocations = spend
      ? await ctx.tx.appCoinSpendAllocation.findMany({ where: { ledgerId: spend.id }, select: { lotId: true, amountMicro: true } })
      : []
    const lots = allocations.length > 0
      ? await ctx.tx.appCoinLot.findMany({ where: { id: { in: allocations.map((allocation) => allocation.lotId) } }, select: { id: true, isFree: true } })
      : []
    const freeLots = new Set(lots.filter((lot) => lot.isFree).map((lot) => lot.id))
    let freeMicro = 0n
    let paidMicro = 0n
    for (const allocation of allocations) {
      if (freeLots.has(allocation.lotId)) freeMicro += allocation.amountMicro
      else paidMicro += allocation.amountMicro
    }
    // No allocation rows: give it all back as free Hash.
    if (freeMicro + paidMicro === 0n) freeMicro = charge.chargedMicro
    const meta = { channelId: charge.channelId, targetUserId: charge.targetUserId }
    if (freeMicro > 0n) await grantLot(ctx, { source: DM_OPEN_REFUND_SOURCE, isFree: true, amountMicro: freeMicro, idempotencyKey: `dm-open-refund:${charge.channelId}:free`, meta })
    if (paidMicro > 0n) await grantLot(ctx, { source: DM_OPEN_REFUND_SOURCE, isFree: false, amountMicro: paidMicro, idempotencyKey: `dm-open-refund:${charge.channelId}:paid`, meta })
    await ctx.tx.dmOpenCharge.update({ where: { id: charge.id }, data: { settledAt: now, outcome: 'refunded' } })
    return freeMicro + paidMicro
  }, { now })
}

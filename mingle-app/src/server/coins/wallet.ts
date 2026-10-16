import type { Prisma } from '@prisma/client/index'
import { prisma } from '@/lib/prisma'
import {
  DAILY_FREE_CAP_MICRO,
  DAILY_FREE_INTERVAL_MS,
  LOW_BALANCE_MICRO,
  microToDisplayCoins,
} from '@/lib/coin-units'
import { resolveCoinBillingMode, type CoinBillingMode } from './config'
import { grantLot, takeFromLots, withLockedWallet, type LockedWallet } from './ledger'
import {
  loadCoinPricingRates,
  quoteCoinUsage,
  type CoinPriceQuote,
  type CoinUsageKind,
  type CoinUsageUnits,
} from './pricing'

export type CoinWalletSnapshot = {
  billingMode: CoinBillingMode
  // Whole coins, rounded down.
  balance: number
  freeBalance: number
  paidBalance: number
  balanceMicro: string
  // When the next daily free refill becomes due (ISO).
  nextDailyGrantAt: string
  // The free balance is at the cap, so the next refill will pay nothing.
  dailyFreeFull: boolean
  dailyFreeCap: number
  lowBalance: boolean
  exhausted: boolean
}

function snapshotFromContext(ctx: LockedWallet): CoinWalletSnapshot {
  const { wallet } = ctx
  const lastGrant = wallet.lastDailyGrantAt ?? ctx.now
  return {
    billingMode: resolveCoinBillingMode(),
    balance: microToDisplayCoins(wallet.balanceMicro),
    freeBalance: microToDisplayCoins(wallet.freeBalanceMicro),
    paidBalance: microToDisplayCoins(wallet.paidBalanceMicro),
    balanceMicro: wallet.balanceMicro.toString(),
    nextDailyGrantAt: new Date(lastGrant.getTime() + DAILY_FREE_INTERVAL_MS).toISOString(),
    dailyFreeFull: wallet.freeBalanceMicro >= DAILY_FREE_CAP_MICRO,
    dailyFreeCap: microToDisplayCoins(DAILY_FREE_CAP_MICRO),
    lowBalance: wallet.balanceMicro < LOW_BALANCE_MICRO,
    exhausted: wallet.balanceMicro <= 0n,
  }
}

/** Reads the wallet, paying the daily free refill first when it is due. */
export async function getCoinWallet(userId: string, now?: Date): Promise<CoinWalletSnapshot> {
  return withLockedWallet(userId, async ctx => snapshotFromContext(ctx), { now })
}

/**
 * Start gate for paid AI features (spec 3.5): only "balance > 0" is required.
 * Always true unless billing is enforced.
 */
export async function canSpendCoins(userId: string | null | undefined): Promise<boolean> {
  if (resolveCoinBillingMode() !== 'enforce' || !userId) return true
  // Hot path (every translation request): a positive snapshot needs no lock.
  // Only a missing or empty wallet takes the locked path, which may pay the daily refill.
  const snapshot = await prisma.appCoinWallet.findUnique({ where: { userId }, select: { balanceMicro: true } })
  if (snapshot && snapshot.balanceMicro > 0n) return true
  const wallet = await getCoinWallet(userId)
  return !wallet.exhausted
}

/** What the wallet API returns while billing is off: no row is read or created. */
export function disabledCoinWallet(now = new Date()): CoinWalletSnapshot {
  return {
    billingMode: 'off',
    balance: 0,
    freeBalance: 0,
    paidBalance: 0,
    balanceMicro: '0',
    nextDailyGrantAt: new Date(now.getTime() + DAILY_FREE_INTERVAL_MS).toISOString(),
    dailyFreeFull: false,
    dailyFreeCap: microToDisplayCoins(DAILY_FREE_CAP_MICRO),
    lowBalance: false,
    exhausted: false,
  }
}

export type CoinChargeInput = {
  userId: string
  kind: CoinUsageKind
  units: CoinUsageUnits
  model?: string | null
  provider?: string | null
  idempotencyKey: string
  conversationId?: string | null
  messageId?: string | null
  sessionKey?: string | null
  now?: Date
}

export type CoinChargeResult = {
  mode: CoinBillingMode
  // false when billing is off or this key was already charged.
  applied: boolean
  duplicate: boolean
  chargedMicro: bigint
  uncollectedMicro: bigint
  // Enforce mode only: the balance is zero after this charge, AI features must stop.
  balanceExhausted: boolean
  wallet: CoinWalletSnapshot | null
}

function chargeRow(input: CoinChargeInput, quote: CoinPriceQuote, now: Date) {
  return {
    userId: input.userId,
    kind: input.kind,
    units: {
      ...input.units,
      rates: quote.components,
      ...(quote.unpricedUnits.length ? { unpriced: quote.unpricedUnits } : {}),
    } as Prisma.InputJsonValue,
    model: input.model ?? null,
    provider: input.provider ?? null,
    pricingRateId: quote.pricingRateId,
    costUsdMicro: quote.costUsdMicro,
    marginBps: quote.marginBps,
    conversationId: input.conversationId ?? null,
    messageId: input.messageId ?? null,
    sessionKey: input.sessionKey ?? null,
    idempotencyKey: input.idempotencyKey,
    createdAt: now,
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002'
}

/**
 * Charges one unit of usage (spec 5.2). Idempotent on idempotencyKey. In enforce
 * mode the wallet is debited free-lots-first; if the lots cannot cover the
 * charge the balance becomes exactly zero and the rest is recorded as uncollected.
 */
export async function chargeCoinUsage(input: CoinChargeInput): Promise<CoinChargeResult> {
  const mode = resolveCoinBillingMode()
  const skipped: CoinChargeResult = {
    mode,
    applied: false,
    duplicate: false,
    chargedMicro: 0n,
    uncollectedMicro: 0n,
    balanceExhausted: false,
    wallet: null,
  }
  if (mode === 'off' || !input.userId || !input.idempotencyKey) return skipped

  const now = input.now ?? new Date()
  const quote = quoteCoinUsage(await loadCoinPricingRates(prisma, now), {
    kind: input.kind,
    model: input.model,
    units: input.units,
    at: now,
  })

  if (mode === 'shadow') {
    try {
      await prisma.appCoinUsageCharge.create({
        data: { ...chargeRow(input, quote, now), chargedMicro: quote.chargedMicro, shadow: true },
      })
    } catch (error) {
      if (isUniqueViolation(error)) return { ...skipped, duplicate: true }
      throw error
    }
    return { ...skipped, applied: true, chargedMicro: quote.chargedMicro }
  }

  return withLockedWallet(input.userId, async (ctx) => {
    const existing = await ctx.tx.appCoinUsageCharge.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      select: { chargedMicro: true, uncollectedMicro: true },
    })
    if (existing) {
      return {
        ...skipped,
        duplicate: true,
        chargedMicro: existing.chargedMicro,
        uncollectedMicro: existing.uncollectedMicro,
        balanceExhausted: ctx.wallet.balanceMicro <= 0n,
        wallet: snapshotFromContext(ctx),
      }
    }

    const charge = await ctx.tx.appCoinUsageCharge.create({
      data: { ...chargeRow(input, quote, now), chargedMicro: 0n },
      select: { id: true },
    })
    const spent = await takeFromLots(ctx, {
      type: 'spend',
      amountMicro: quote.chargedMicro,
      idempotencyKey: `spend:${input.idempotencyKey}`,
      usageChargeId: charge.id,
      meta: { kind: input.kind },
    })
    // Not a ledger write: the charge row is completed inside the same transaction that created it.
    await ctx.tx.appCoinUsageCharge.update({
      where: { id: charge.id },
      data: { chargedMicro: spent.spentMicro, uncollectedMicro: spent.shortfallMicro },
    })
    return {
      mode,
      applied: true,
      duplicate: false,
      chargedMicro: spent.spentMicro,
      uncollectedMicro: spent.shortfallMicro,
      balanceExhausted: ctx.wallet.balanceMicro <= 0n,
      wallet: snapshotFromContext(ctx),
    }
  }, { now })
}

/** Billing must never break the feature it meters: failures are logged, not thrown. */
export async function chargeCoinUsageSafely(input: CoinChargeInput): Promise<CoinChargeResult | null> {
  try {
    return await chargeCoinUsage(input)
  } catch (error) {
    console.error('[coins] charge failed', {
      kind: input.kind,
      idempotencyKey: input.idempotencyKey,
      error: error instanceof Error ? error.message : 'unknown',
    })
    return null
  }
}

export type CoinAdminAdjustInput = {
  userId: string
  // Positive = grant, negative = revoke.
  amountMicro: bigint
  isFree: boolean
  reason: string
  expiresAt?: Date | null
  adminUsername: string
  requestIp?: string | null
  userAgent?: string | null
}

/** Admin grant or revoke (spec 8). A revoke stops at the remaining balance of that kind. */
export async function adjustCoinsAsAdmin(input: CoinAdminAdjustInput): Promise<{
  adminGrantId: string
  appliedMicro: bigint
  wallet: CoinWalletSnapshot
}> {
  const reason = input.reason.trim()
  if (!reason) throw new Error('coin_admin_reason_required')
  if (input.amountMicro === 0n) throw new Error('coin_admin_amount_required')

  return withLockedWallet(input.userId, async (ctx) => {
    const record = await ctx.tx.appCoinAdminGrant.create({
      data: {
        adminUsername: input.adminUsername,
        requestIp: input.requestIp ?? null,
        userAgent: input.userAgent ?? null,
        userId: input.userId,
        amountMicro: input.amountMicro,
        isFree: input.isFree,
        reason,
        expiresAt: input.amountMicro > 0n ? input.expiresAt ?? null : null,
        createdAt: ctx.now,
      },
      select: { id: true },
    })

    let appliedMicro: bigint
    if (input.amountMicro > 0n) {
      await grantLot(ctx, {
        source: 'admin_grant',
        isFree: input.isFree,
        amountMicro: input.amountMicro,
        idempotencyKey: `admin:${record.id}`,
        expiresAt: input.expiresAt ?? null,
        adminGrantId: record.id,
        note: reason,
      })
      appliedMicro = input.amountMicro
    } else {
      const taken = await takeFromLots(ctx, {
        type: 'admin_revoke',
        amountMicro: -input.amountMicro,
        idempotencyKey: `admin:${record.id}`,
        adminGrantId: record.id,
        filter: { isFree: input.isFree },
        meta: { reason },
      })
      appliedMicro = -taken.spentMicro
    }
    await ctx.tx.appCoinAdminGrant.update({ where: { id: record.id }, data: { appliedMicro } })
    return { adminGrantId: record.id, appliedMicro, wallet: snapshotFromContext(ctx) }
    // An admin action is not a user visit: it must not start the user's daily cycle.
  }, { skipDailyGrant: true })
}

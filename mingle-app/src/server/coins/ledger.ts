import { Prisma } from '@prisma/client/index'
import { prisma } from '@/lib/prisma'
import { DAILY_FREE_INTERVAL_MS } from '@/lib/coin-units'
import { resolveDailyFreeCapMicro, resolveSignupBonusMicro } from './config'
import { computeDailyFreeGrant, planLotSpend, type LotAllocation } from './lot-plan'

// Wallet, lot and ledger writes (docs/coin-iap-spec.md 5). Every write runs
// inside withLockedWallet: the wallet row lock serializes one user's writes, so
// lots need no lock of their own. app_coin_ledger is append-only: this module
// only ever inserts into it.

export type CoinLotSource = 'daily_free' | 'purchase' | 'admin_grant' | 'signup_bonus' | 'refund_reversal' | 'gift' | 'referral'
export type CoinLedgerType = 'grant' | 'spend' | 'expire' | 'refund_clawback' | 'admin_revoke' | 'adjust' | 'gift_sent'

type WalletState = {
  userId: string
  balanceMicro: bigint
  freeBalanceMicro: bigint
  paidBalanceMicro: bigint
  lastDailyGrantAt: Date | null
  dailyGrantSeq: number
  lifetimePurchasedMicro: bigint
  lifetimeSpentMicro: bigint
}

export type LockedWallet = {
  tx: Prisma.TransactionClient
  wallet: WalletState
  now: Date
}

type LedgerRefs = {
  lotId?: string | null
  usageChargeId?: string | null
  purchaseId?: string | null
  adminGrantId?: string | null
  meta?: Prisma.InputJsonValue
}

async function appendLedger(
  ctx: LockedWallet,
  input: LedgerRefs & { type: CoinLedgerType; amountMicro: bigint; idempotencyKey: string },
) {
  ctx.wallet.balanceMicro += input.amountMicro
  return ctx.tx.appCoinLedger.create({
    data: {
      userId: ctx.wallet.userId,
      type: input.type,
      amountMicro: input.amountMicro,
      balanceAfterMicro: ctx.wallet.balanceMicro,
      lotId: input.lotId ?? null,
      usageChargeId: input.usageChargeId ?? null,
      purchaseId: input.purchaseId ?? null,
      adminGrantId: input.adminGrantId ?? null,
      idempotencyKey: input.idempotencyKey,
      ...(input.meta === undefined ? {} : { meta: input.meta }),
      createdAt: ctx.now,
    },
    select: { id: true },
  })
}

function addToBucket(wallet: WalletState, isFree: boolean, deltaMicro: bigint) {
  if (isFree) wallet.freeBalanceMicro += deltaMicro
  else wallet.paidBalanceMicro += deltaMicro
}

export async function hasLedgerEntry(ctx: LockedWallet, idempotencyKey: string): Promise<boolean> {
  const row = await ctx.tx.appCoinLedger.findUnique({ where: { idempotencyKey }, select: { id: true } })
  return Boolean(row)
}

/** Creates one lot and its grant ledger row. */
export async function grantLot(
  ctx: LockedWallet,
  input: {
    source: CoinLotSource
    isFree: boolean
    amountMicro: bigint
    idempotencyKey: string
    expiresAt?: Date | null
    purchaseId?: string | null
    adminGrantId?: string | null
    note?: string | null
    meta?: Prisma.InputJsonValue
  },
): Promise<{ lotId: string }> {
  if (input.amountMicro <= 0n) throw new Error('coin_grant_amount_must_be_positive')
  const lot = await ctx.tx.appCoinLot.create({
    data: {
      userId: ctx.wallet.userId,
      source: input.source,
      isFree: input.isFree,
      grantedMicro: input.amountMicro,
      remainingMicro: input.amountMicro,
      expiresAt: input.expiresAt ?? null,
      purchaseId: input.purchaseId ?? null,
      adminGrantId: input.adminGrantId ?? null,
      note: input.note ?? null,
      ...(input.meta === undefined ? {} : { meta: input.meta }),
      createdAt: ctx.now,
    },
    select: { id: true },
  })
  addToBucket(ctx.wallet, input.isFree, input.amountMicro)
  if (input.source === 'purchase') ctx.wallet.lifetimePurchasedMicro += input.amountMicro
  await appendLedger(ctx, {
    type: 'grant',
    amountMicro: input.amountMicro,
    idempotencyKey: input.idempotencyKey,
    lotId: lot.id,
    purchaseId: input.purchaseId,
    adminGrantId: input.adminGrantId,
    meta: { source: input.source, isFree: input.isFree, ...(isPlainObject(input.meta) ? input.meta : {}) },
  })
  return { lotId: lot.id }
}

function isPlainObject(value: unknown): value is Record<string, Prisma.InputJsonValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function applyAllocations(ctx: LockedWallet, allocations: readonly LotAllocation[]) {
  for (const allocation of allocations) {
    await ctx.tx.appCoinLot.update({
      where: { id: allocation.lotId },
      data: { remainingMicro: { decrement: allocation.amountMicro } },
    })
    addToBucket(ctx.wallet, allocation.isFree, -allocation.amountMicro)
  }
}

/**
 * Removes up to amountMicro in spend order (free first, then oldest) and writes
 * one negative ledger row with its per-lot allocations. Stops at zero: whatever
 * the lots cannot cover comes back as shortfallMicro and is never owed.
 */
export async function takeFromLots(
  ctx: LockedWallet,
  input: LedgerRefs & {
    type: Exclude<CoinLedgerType, 'grant'>
    amountMicro: bigint
    idempotencyKey: string
    filter?: { isFree?: boolean; lotId?: string; sources?: readonly CoinLotSource[] }
  },
): Promise<{ spentMicro: bigint; shortfallMicro: bigint; allocations: LotAllocation[] }> {
  const lots = await ctx.tx.appCoinLot.findMany({
    where: {
      userId: ctx.wallet.userId,
      remainingMicro: { gt: 0 },
      ...(input.filter?.isFree === undefined ? {} : { isFree: input.filter.isFree }),
      ...(input.filter?.lotId ? { id: input.filter.lotId } : {}),
      ...(input.filter?.sources ? { source: { in: [...input.filter.sources] } } : {}),
    },
    select: { id: true, isFree: true, remainingMicro: true, expiresAt: true, createdAt: true },
  })
  const plan = planLotSpend(lots, input.amountMicro, ctx.now)
  if (plan.spentMicro === 0n) return plan

  await applyAllocations(ctx, plan.allocations)
  if (input.type === 'spend') ctx.wallet.lifetimeSpentMicro += plan.spentMicro
  const ledger = await appendLedger(ctx, {
    type: input.type,
    amountMicro: -plan.spentMicro,
    idempotencyKey: input.idempotencyKey,
    lotId: plan.allocations.length === 1 ? plan.allocations[0].lotId : input.lotId,
    usageChargeId: input.usageChargeId,
    purchaseId: input.purchaseId,
    adminGrantId: input.adminGrantId,
    meta: input.meta,
  })
  await ctx.tx.appCoinSpendAllocation.createMany({
    data: plan.allocations.map(allocation => ({
      ledgerId: ledger.id,
      lotId: allocation.lotId,
      amountMicro: allocation.amountMicro,
    })),
  })
  return plan
}

async function expireLots(ctx: LockedWallet) {
  const expired = await ctx.tx.appCoinLot.findMany({
    where: { userId: ctx.wallet.userId, remainingMicro: { gt: 0 }, expiresAt: { lte: ctx.now } },
    select: { id: true, isFree: true, remainingMicro: true },
    orderBy: { createdAt: 'asc' },
  })
  for (const lot of expired) {
    await ctx.tx.appCoinLot.update({ where: { id: lot.id }, data: { remainingMicro: 0n } })
    addToBucket(ctx.wallet, lot.isFree, -lot.remainingMicro)
    const ledger = await appendLedger(ctx, {
      type: 'expire',
      amountMicro: -lot.remainingMicro,
      idempotencyKey: `expire:${lot.id}`,
      lotId: lot.id,
    })
    await ctx.tx.appCoinSpendAllocation.create({
      data: { ledgerId: ledger.id, lotId: lot.id, amountMicro: lot.remainingMicro },
    })
  }
}

/** Lazy daily refill (spec 3.3): no cron; the first wallet touch after 24h pays it. */
async function applyDailyFreeGrant(ctx: LockedWallet) {
  const grant = computeDailyFreeGrant({
    lastDailyGrantAt: ctx.wallet.lastDailyGrantAt,
    freeBalanceMicro: ctx.wallet.freeBalanceMicro,
    now: ctx.now,
    // 0 (the default) still stamps the cycle, which is how a wallet's first open is remembered.
    capMicro: resolveDailyFreeCapMicro(),
    intervalMs: DAILY_FREE_INTERVAL_MS,
  })
  if (!grant.due) return
  // The cycle restarts even when nothing is paid out, so it never drifts.
  ctx.wallet.lastDailyGrantAt = ctx.now
  ctx.wallet.dailyGrantSeq += 1
  if (grant.amountMicro === 0n) return
  await grantLot(ctx, {
    source: 'daily_free',
    isFree: true,
    amountMicro: grant.amountMicro,
    idempotencyKey: `daily:${ctx.wallet.userId}:${ctx.wallet.dailyGrantSeq}`,
  })
}

/**
 * Sign-up bonus: a wallet that has never had a daily refill is brand new. The
 * bonus is free coins, so it also counts toward the daily cap (spec 3.3) and
 * delays later refills until the free balance drops under the cap again.
 */
async function applySignupBonus(ctx: LockedWallet) {
  const amountMicro = resolveSignupBonusMicro()
  if (amountMicro <= 0n) return
  await grantLot(ctx, {
    source: 'signup_bonus',
    isFree: true,
    amountMicro,
    idempotencyKey: `signup:${ctx.wallet.userId}`,
  })
}

function walletFingerprint(wallet: WalletState): string {
  return [
    wallet.balanceMicro,
    wallet.freeBalanceMicro,
    wallet.paidBalanceMicro,
    wallet.lastDailyGrantAt?.getTime() ?? '',
    wallet.dailyGrantSeq,
    wallet.lifetimePurchasedMicro,
    wallet.lifetimeSpentMicro,
  ].join(':')
}

const WALLET_TRANSACTION_ATTEMPTS = 3

function isRetryableTransactionError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false
  // P2034: write conflict / deadlock. P2028: transaction API error (e.g. pool wait timeout).
  return error.code === 'P2034' || error.code === 'P2028'
}

type WalletOptions = { now?: Date; skipDailyGrant?: boolean }

/** Locks one wallet row inside tx, then writes off expired lots and pays the daily refill. */
async function openLockedWallet(
  tx: Prisma.TransactionClient,
  userId: string,
  now: Date,
  skipDailyGrant: boolean,
): Promise<{ ctx: LockedWallet; loaded: string }> {
  await tx.$executeRaw`
    INSERT INTO app.app_coin_wallets (user_id, updated_at)
    VALUES (${userId}, CURRENT_TIMESTAMP)
    ON CONFLICT (user_id) DO NOTHING`
  await tx.$queryRaw`SELECT user_id FROM app.app_coin_wallets WHERE user_id = ${userId} FOR UPDATE`
  const row = await tx.appCoinWallet.findUniqueOrThrow({ where: { userId } })
  const ctx: LockedWallet = {
    tx,
    now,
    wallet: {
      userId,
      balanceMicro: row.balanceMicro,
      freeBalanceMicro: row.freeBalanceMicro,
      paidBalanceMicro: row.paidBalanceMicro,
      lastDailyGrantAt: row.lastDailyGrantAt,
      dailyGrantSeq: row.dailyGrantSeq,
      lifetimePurchasedMicro: row.lifetimePurchasedMicro,
      lifetimeSpentMicro: row.lifetimeSpentMicro,
    },
  }
  const loaded = walletFingerprint(ctx.wallet)
  const isNewWallet = row.dailyGrantSeq === 0 && !row.lastDailyGrantAt
  await expireLots(ctx)
  if (!skipDailyGrant) {
    await applyDailyFreeGrant(ctx)
    if (isNewWallet) await applySignupBonus(ctx)
  }
  return { ctx, loaded }
}

/** Checks the invariants and saves the snapshot columns when anything changed. */
async function saveLockedWallet(ctx: LockedWallet, loaded: string) {
  if (ctx.wallet.balanceMicro < 0n
    || ctx.wallet.balanceMicro !== ctx.wallet.freeBalanceMicro + ctx.wallet.paidBalanceMicro) {
    throw new Error('coin_wallet_invariant_violated')
  }
  // Plain reads (no refill, no expiry) leave the row untouched.
  if (walletFingerprint(ctx.wallet) === loaded) return
  await ctx.tx.appCoinWallet.update({
    where: { userId: ctx.wallet.userId },
    data: {
      balanceMicro: ctx.wallet.balanceMicro,
      freeBalanceMicro: ctx.wallet.freeBalanceMicro,
      paidBalanceMicro: ctx.wallet.paidBalanceMicro,
      lastDailyGrantAt: ctx.wallet.lastDailyGrantAt,
      dailyGrantSeq: ctx.wallet.dailyGrantSeq,
      lifetimePurchasedMicro: ctx.wallet.lifetimePurchasedMicro,
      lifetimeSpentMicro: ctx.wallet.lifetimeSpentMicro,
      version: { increment: 1 },
    },
  })
}

async function runWalletTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= WALLET_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(fn, { maxWait: 10_000, timeout: 20_000 })
    } catch (error) {
      lastError = error
      if (attempt === WALLET_TRANSACTION_ATTEMPTS || !isRetryableTransactionError(error)) throw error
    }
  }
  throw lastError
}

/**
 * Runs fn with the user's wallet row locked. Before fn: expired lots are
 * written off and the daily free refill is applied. After fn: the snapshot
 * columns are saved. Everything commits or rolls back together.
 */
export async function withLockedWallet<T>(
  userId: string,
  fn: (ctx: LockedWallet) => Promise<T>,
  options: WalletOptions = {},
): Promise<T> {
  if (!userId) throw new Error('coin_wallet_user_required')
  return runWalletTransaction(async (tx) => {
    const { ctx, loaded } = await openLockedWallet(tx, userId, options.now ?? new Date(), options.skipDailyGrant === true)
    const result = await fn(ctx)
    await saveLockedWallet(ctx, loaded)
    return result
  })
}

/**
 * Two wallets locked in one transaction, for moving coins between users. Rows
 * are locked in user-id order, so two opposite transfers cannot deadlock.
 * `second` is not treated as a visit by that user: no daily refill, no sign-up bonus.
 */
export async function withLockedWalletPair<T>(
  firstUserId: string,
  secondUserId: string,
  fn: (first: LockedWallet, second: LockedWallet) => Promise<T>,
  options: { now?: Date } = {},
): Promise<T> {
  if (!firstUserId || !secondUserId) throw new Error('coin_wallet_user_required')
  if (firstUserId === secondUserId) throw new Error('coin_wallet_pair_must_differ')
  return runWalletTransaction(async (tx) => {
    const now = options.now ?? new Date()
    const openFirst = () => openLockedWallet(tx, firstUserId, now, false)
    const openSecond = () => openLockedWallet(tx, secondUserId, now, true)
    let first: Awaited<ReturnType<typeof openLockedWallet>>
    let second: Awaited<ReturnType<typeof openLockedWallet>>
    if (firstUserId < secondUserId) {
      first = await openFirst()
      second = await openSecond()
    } else {
      second = await openSecond()
      first = await openFirst()
    }
    const result = await fn(first.ctx, second.ctx)
    await saveLockedWallet(first.ctx, first.loaded)
    await saveLockedWallet(second.ctx, second.loaded)
    return result
  })
}

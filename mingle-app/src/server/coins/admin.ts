import { Prisma } from '@prisma/client/index'
import { prisma } from '@/lib/prisma'
import { clearCoinPricingRateCache, COIN_PRICING_UNITS, COIN_USAGE_KINDS, type CoinPricingUnit, type CoinUsageKind } from './pricing'

// Read models and small writes for /admin/coins (docs/coin-iap-spec.md 8).

const USER_SELECT = { id: true, email: true, handle: true, name: true, createdAt: true } as const

export async function searchCoinAdminUsers(query: string) {
  const term = query.trim().replace(/^@/, '')
  if (!term) return []
  return prisma.user.findMany({
    where: {
      OR: [
        { id: term },
        { email: { equals: term, mode: 'insensitive' } },
        { handle: { equals: term, mode: 'insensitive' } },
        { email: { startsWith: term, mode: 'insensitive' } },
        { handle: { startsWith: term, mode: 'insensitive' } },
      ],
    },
    select: USER_SELECT,
    orderBy: { createdAt: 'desc' },
    take: 20,
  })
}

/** Everything about one user's coins. Read-only: it does not trigger the daily refill. */
export async function loadCoinAdminUserDetail(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: USER_SELECT })
  if (!user) return null
  const since = new Date(Date.now() - 30 * 86_400_000)
  const [wallet, lots, ledger, purchases, adminGrants, usage, refundCount] = await Promise.all([
    prisma.appCoinWallet.findUnique({ where: { userId } }),
    prisma.appCoinLot.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 50 }),
    prisma.appCoinLedger.findMany({ where: { userId }, orderBy: { id: 'desc' }, take: 60 }),
    prisma.appIapPurchase.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 30 }),
    prisma.appCoinAdminGrant.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 30 }),
    prisma.appCoinUsageCharge.groupBy({
      by: ['kind'],
      where: { userId, shadow: false, createdAt: { gte: since } },
      _sum: { chargedMicro: true, costUsdMicro: true, uncollectedMicro: true },
      _count: { _all: true },
    }),
    prisma.appIapPurchase.count({ where: { userId, status: { in: ['refunded', 'revoked'] } } }),
  ])
  return { user, wallet, lots, ledger, purchases, adminGrants, usage, refundCount }
}

export type CoinAdminDailyRow = {
  day: string
  purchasedMicro: bigint
  freeGrantedMicro: bigint
  adminGrantedMicro: bigint
  spentMicro: bigint
  spentByKind: Record<CoinUsageKind, bigint>
  costUsdMicro: bigint
  uncollectedMicro: bigint
  shadowChargedMicro: bigint
  clawedBackMicro: bigint
  revenueUsdCents: number
  purchaseCount: number
  refundCount: number
}

function utcLiteral(date: Date): string {
  return date.toISOString().replace('T', ' ').replace('Z', '')
}

function emptyDailyRow(day: string): CoinAdminDailyRow {
  return {
    day,
    purchasedMicro: 0n,
    freeGrantedMicro: 0n,
    adminGrantedMicro: 0n,
    spentMicro: 0n,
    spentByKind: { stt: 0n, translation: 0n, tts: 0n, image_text: 0n },
    costUsdMicro: 0n,
    uncollectedMicro: 0n,
    shadowChargedMicro: 0n,
    clawedBackMicro: 0n,
    revenueUsdCents: 0,
    purchaseCount: 0,
    refundCount: 0,
  }
}

/** Daily coin economy for the last `days` days, in KST days like /admin/dashboard. */
export async function loadCoinAdminDashboard(days: number, now = new Date()): Promise<CoinAdminDailyRow[]> {
  const kstOffsetMs = 9 * 3_600_000
  const localNow = new Date(now.getTime() + kstOffsetMs)
  const firstLocalDay = Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate()) - (days - 1) * 86_400_000
  const since = utcLiteral(new Date(firstLocalDay - kstOffsetMs))
  const dayOf = Prisma.sql`to_char(date_trunc('day', created_at + interval '9 hours'), 'YYYY-MM-DD')`

  const [lots, charges, clawbacks, purchases, refunds] = await Promise.all([
    prisma.$queryRaw<Array<{ day: string; source: string; granted: bigint }>>(Prisma.sql`
      SELECT ${dayOf} AS day, source, SUM(granted_micro)::bigint AS granted
      FROM app_coin_lots WHERE created_at >= ${since}::timestamp GROUP BY 1, 2`),
    prisma.$queryRaw<Array<{ day: string; kind: string; shadow: boolean; charged: bigint; cost: bigint; uncollected: bigint }>>(Prisma.sql`
      SELECT ${dayOf} AS day, kind, shadow,
        SUM(charged_micro)::bigint AS charged, SUM(cost_usd_micro)::bigint AS cost, SUM(uncollected_micro)::bigint AS uncollected
      FROM app_coin_usage_charges WHERE created_at >= ${since}::timestamp GROUP BY 1, 2, 3`),
    prisma.$queryRaw<Array<{ day: string; amount: bigint }>>(Prisma.sql`
      SELECT ${dayOf} AS day, SUM(-amount_micro)::bigint AS amount
      FROM app_coin_ledger WHERE type = 'refund_clawback' AND created_at >= ${since}::timestamp GROUP BY 1`),
    prisma.$queryRaw<Array<{ day: string; count: bigint; cents: bigint | null }>>(Prisma.sql`
      SELECT to_char(date_trunc('day', p.created_at + interval '9 hours'), 'YYYY-MM-DD') AS day,
        COUNT(*)::bigint AS count, SUM(product.price_usd_cents)::bigint AS cents
      FROM app_iap_purchases p JOIN app_iap_products product ON product.id = p.product_id
      WHERE p.created_at >= ${since}::timestamp AND p.environment = 'production' GROUP BY 1`),
    prisma.$queryRaw<Array<{ day: string; count: bigint }>>(Prisma.sql`
      SELECT to_char(date_trunc('day', refunded_at + interval '9 hours'), 'YYYY-MM-DD') AS day, COUNT(*)::bigint AS count
      FROM app_iap_purchases WHERE refunded_at >= ${since}::timestamp GROUP BY 1`),
  ])

  const rows = new Map<string, CoinAdminDailyRow>()
  for (let index = 0; index < days; index += 1) {
    const day = new Date(firstLocalDay + index * 86_400_000).toISOString().slice(0, 10)
    rows.set(day, emptyDailyRow(day))
  }
  for (const lot of lots) {
    const row = rows.get(lot.day)
    if (!row) continue
    if (lot.source === 'purchase') row.purchasedMicro += lot.granted
    else if (lot.source === 'admin_grant') row.adminGrantedMicro += lot.granted
    else row.freeGrantedMicro += lot.granted
  }
  for (const charge of charges) {
    const row = rows.get(charge.day)
    if (!row) continue
    if (charge.shadow) {
      row.shadowChargedMicro += charge.charged
      row.costUsdMicro += charge.cost
      continue
    }
    row.spentMicro += charge.charged
    row.costUsdMicro += charge.cost
    row.uncollectedMicro += charge.uncollected
    if (COIN_USAGE_KINDS.includes(charge.kind as CoinUsageKind)) row.spentByKind[charge.kind as CoinUsageKind] += charge.charged
  }
  for (const clawback of clawbacks) {
    const row = rows.get(clawback.day)
    if (row) row.clawedBackMicro += clawback.amount
  }
  for (const purchase of purchases) {
    const row = rows.get(purchase.day)
    if (!row) continue
    row.purchaseCount += Number(purchase.count)
    row.revenueUsdCents += Number(purchase.cents ?? 0n)
  }
  for (const refund of refunds) {
    const row = rows.get(refund.day)
    if (row) row.refundCount += Number(refund.count)
  }
  return [...rows.values()]
}

/** Users whose ledger sum, lot remainder sum and wallet snapshot disagree (spec 5.3). Must be zero. */
export async function findCoinIntegrityMismatches(limit = 50) {
  return prisma.$queryRaw<Array<{ user_id: string; wallet: bigint; ledger: bigint; lots: bigint }>>(Prisma.sql`
    SELECT w.user_id,
      w.balance_micro AS wallet,
      COALESCE(l.total, 0)::bigint AS ledger,
      COALESCE(lot.total, 0)::bigint AS lots
    FROM app_coin_wallets w
    LEFT JOIN (SELECT user_id, SUM(amount_micro) AS total FROM app_coin_ledger GROUP BY user_id) l ON l.user_id = w.user_id
    LEFT JOIN (SELECT user_id, SUM(remaining_micro) AS total FROM app_coin_lots GROUP BY user_id) lot ON lot.user_id = w.user_id
    WHERE w.balance_micro <> COALESCE(l.total, 0)
       OR w.balance_micro <> COALESCE(lot.total, 0)
       OR w.balance_micro <> w.free_balance_micro + w.paid_balance_micro
       OR w.balance_micro < 0
    LIMIT ${limit}`)
}

export async function listCoinAdminCatalog() {
  const [products, rates] = await Promise.all([
    prisma.appIapProduct.findMany({ orderBy: [{ platform: 'asc' }, { sortOrder: 'asc' }] }),
    prisma.appCoinPricingRate.findMany({
      where: { effectiveTo: null },
      orderBy: [{ kind: 'asc' }, { model: 'asc' }, { unit: 'asc' }],
    }),
  ])
  return { products, rates }
}

export async function updateCoinProduct(input: { id: string; isActive: boolean; sortOrder: number; badge: string | null }) {
  await prisma.appIapProduct.update({
    where: { id: input.id },
    data: { isActive: input.isActive, sortOrder: input.sortOrder, badge: input.badge },
  })
}

/**
 * Adds a price row. Existing rows are never edited: the open row for the same
 * kind/model/unit is closed at the new row's start.
 */
export async function addCoinPricingRate(input: {
  kind: CoinUsageKind
  provider: string
  model: string
  unit: CoinPricingUnit
  usdMicroPerMillionUnits: bigint
  marginBps: number
  effectiveFrom: Date
  note: string | null
  adminUsername: string
}) {
  if (!COIN_USAGE_KINDS.includes(input.kind) || !COIN_PRICING_UNITS.includes(input.unit)) throw new Error('invalid_rate')
  if (input.usdMicroPerMillionUnits < 0n || input.marginBps < 10_000 || input.marginBps > 100_000) throw new Error('invalid_rate')
  const model = input.model.trim() || '*'
  await prisma.$transaction([
    prisma.appCoinPricingRate.updateMany({
      where: { kind: input.kind, model, unit: input.unit, effectiveTo: null },
      data: { effectiveTo: input.effectiveFrom },
    }),
    prisma.appCoinPricingRate.create({
      data: {
        kind: input.kind,
        provider: input.provider.trim() || '*',
        model,
        unit: input.unit,
        usdMicroPerMillionUnits: input.usdMicroPerMillionUnits,
        marginBps: input.marginBps,
        effectiveFrom: input.effectiveFrom,
        note: input.note,
        createdByAdmin: input.adminUsername,
      },
    }),
  ])
  clearCoinPricingRateCache()
}

import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Wallet/ledger behaviour against a real PostgreSQL (docs/coin-iap-spec.md 11).
// Needs a disposable database that already has the schema and seed rows:
//   COIN_TEST_DATABASE_URL="postgresql://.../cointest?schema=app" pnpm test:live src/integration/live/coins-ledger.live.test.ts
const TEST_DATABASE_URL = process.env.COIN_TEST_DATABASE_URL || ''
const DAY = 24 * 60 * 60 * 1000
const COIN = 1_000_000n

type Wallet = typeof import('@/server/coins/wallet')
type PrismaModule = typeof import('@/lib/prisma')

describe.skipIf(!TEST_DATABASE_URL)('coin ledger (live PostgreSQL)', () => {
  let wallet: Wallet
  let prisma: PrismaModule['prisma']
  const previousMode = process.env.COIN_BILLING_ENABLED

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL
    process.env.COIN_BILLING_ENABLED = '1'
    prisma = (await import('@/lib/prisma')).prisma
    wallet = await import('@/server/coins/wallet')
  })

  afterAll(async () => {
    process.env.COIN_BILLING_ENABLED = previousMode
    await prisma?.$disconnect()
  })

  const newUser = () => `coin-test-${randomUUID()}`

  async function sums(userId: string) {
    const [ledger, lots, row] = await Promise.all([
      prisma.appCoinLedger.aggregate({ where: { userId }, _sum: { amountMicro: true } }),
      prisma.appCoinLot.aggregate({ where: { userId }, _sum: { remainingMicro: true } }),
      prisma.appCoinWallet.findUniqueOrThrow({ where: { userId } }),
    ])
    return { ledger: ledger._sum.amountMicro ?? 0n, lots: lots._sum.remainingMicro ?? 0n, wallet: row.balanceMicro }
  }

  function stt(userId: string, seconds: number, key: string, now?: Date) {
    return wallet.chargeCoinUsage({ userId, kind: 'stt', units: { second: seconds }, idempotencyKey: key, now })
  }

  it('gives a new user one 1,000-coin free lot and nothing more within 24 hours', async () => {
    const userId = newUser()
    const t0 = new Date('2026-10-03T00:00:00Z')
    expect((await wallet.getCoinWallet(userId, t0)).balance).toBe(1000)
    expect((await wallet.getCoinWallet(userId, new Date(t0.getTime() + DAY - 1))).balance).toBe(1000)
    expect(await prisma.appCoinLot.count({ where: { userId } })).toBe(1)
    expect(await prisma.appCoinLedger.count({ where: { userId } })).toBe(1)
  })

  it('refills the free balance to 1,000 once per 24 hours, without backfill', async () => {
    const userId = newUser()
    const t0 = new Date('2026-10-03T00:00:00Z')
    await wallet.getCoinWallet(userId, t0)
    // 14,000 s of STT = 700 coins at margin 1.5 -> 300 free coins left.
    await stt(userId, 14_000, `${userId}:a`, t0)
    expect((await wallet.getCoinWallet(userId, t0)).freeBalance).toBe(300)

    const afterThreeDays = new Date(t0.getTime() + 3 * DAY)
    expect((await wallet.getCoinWallet(userId, afterThreeDays)).freeBalance).toBe(1000)
    const refill = await prisma.appCoinLot.findFirstOrThrow({ where: { userId }, orderBy: { createdAt: 'desc' } })
    // The STT rate is a rounded repeating decimal, so the charge is a hair under 700 coins.
    expect(refill.grantedMicro).toBeGreaterThan(699n * COIN)
    expect(refill.grantedMicro).toBeLessThanOrEqual(700n * COIN)

    // Full free balance: the cycle restarts but no lot and no ledger row are written.
    const ledgerRows = await prisma.appCoinLedger.count({ where: { userId } })
    await wallet.getCoinWallet(userId, new Date(afterThreeDays.getTime() + DAY))
    expect(await prisma.appCoinLedger.count({ where: { userId } })).toBe(ledgerRows)
  })

  it('ignores the paid balance when computing the refill, and holds it back while admin free coins remain', async () => {
    const userId = newUser()
    const t0 = new Date('2026-10-03T00:00:00Z')
    await wallet.getCoinWallet(userId, t0)
    await wallet.adjustCoinsAsAdmin({ userId, amountMicro: 5000n * COIN, isFree: false, reason: 'paid test', adminUsername: 'test' })
    await wallet.adjustCoinsAsAdmin({ userId, amountMicro: 5000n * COIN, isFree: true, reason: 'free test', adminUsername: 'test' })
    const next = await wallet.getCoinWallet(userId, new Date(t0.getTime() + DAY))
    expect(next.freeBalance).toBe(6000)
    expect(next.paidBalance).toBe(5000)
  })

  it('spends free lots first, then paid lots oldest first, and records each allocation', async () => {
    const userId = newUser()
    const t0 = new Date('2026-10-03T00:00:00Z')
    await wallet.getCoinWallet(userId, t0)
    const first = await wallet.adjustCoinsAsAdmin({ userId, amountMicro: 100n * COIN, isFree: false, reason: 'old paid', adminUsername: 'test' })
    const second = await wallet.adjustCoinsAsAdmin({ userId, amountMicro: 100n * COIN, isFree: false, reason: 'new paid', adminUsername: 'test' })

    // 22,000 s = 1,100 coins: all 1,000 free coins, then 100 from the older paid lot.
    const result = await stt(userId, 22_000, `${userId}:big`, new Date())
    expect(result.chargedMicro).toBeGreaterThan(1099n * COIN)
    const lots = await prisma.appCoinLot.findMany({ where: { userId } })
    const byGrant = (id: string) => lots.find(lot => lot.adminGrantId === id)!
    expect(lots.find(lot => lot.source === 'daily_free')!.remainingMicro).toBe(0n)
    expect(byGrant(first.adminGrantId).remainingMicro).toBeLessThan(1n * COIN)
    expect(byGrant(second.adminGrantId).remainingMicro).toBe(100n * COIN)

    const spend = await prisma.appCoinLedger.findFirstOrThrow({ where: { userId, type: 'spend' }, include: { allocations: true } })
    expect(spend.allocations).toHaveLength(2)
    expect(spend.allocations.reduce((sum, allocation) => sum + allocation.amountMicro, 0n)).toBe(-spend.amountMicro)
  })

  it('never goes negative: the last charge takes what is left and records the rest as uncollected', async () => {
    const userId = newUser()
    await wallet.getCoinWallet(userId)
    const result = await stt(userId, 40_000, `${userId}:over`)
    expect(result.chargedMicro).toBe(1000n * COIN)
    expect(result.uncollectedMicro).toBeGreaterThan(0n)
    expect(result.balanceExhausted).toBe(true)
    expect(await wallet.canSpendCoins(userId)).toBe(false)
    // A user who has never been seen passes the gate: the locked path pays the first refill.
    expect(await wallet.canSpendCoins(newUser())).toBe(true)

    const after = await stt(userId, 60, `${userId}:after`)
    expect(after.chargedMicro).toBe(0n)
    const state = await sums(userId)
    expect(state).toEqual({ ledger: 0n, lots: 0n, wallet: 0n })
  })

  it('charges an idempotency key once', async () => {
    const userId = newUser()
    await wallet.getCoinWallet(userId)
    const first = await stt(userId, 60, `${userId}:same`)
    const again = await stt(userId, 60, `${userId}:same`)
    expect(first.applied).toBe(true)
    expect(again.duplicate).toBe(true)
    expect(await prisma.appCoinUsageCharge.count({ where: { userId } })).toBe(1)
    expect((await sums(userId)).wallet).toBe(1000n * COIN - first.chargedMicro)
  })

  it('keeps ledger, lots and wallet equal under 100 concurrent charges', async () => {
    const userId = newUser()
    await wallet.getCoinWallet(userId)
    // 100 x 300 s = 15 coins each = 1,500 coins against 1,000: the tail must hit zero, not below.
    const results = await Promise.all(
      Array.from({ length: 100 }, (_, index) => stt(userId, 300, `${userId}:c:${index % 90}`)),
    )
    const state = await sums(userId)
    expect(state.wallet).toBe(0n)
    expect(state.ledger).toBe(state.wallet)
    expect(state.lots).toBe(state.wallet)
    // 10 of the 100 requests reuse a key: 90 distinct charges exist.
    expect(await prisma.appCoinUsageCharge.count({ where: { userId } })).toBe(90)
    const charged = results.filter(result => result.applied).reduce((sum, result) => sum + result.chargedMicro, 0n)
    expect(charged).toBe(1000n * COIN)
  }, 60_000)

  it('revokes only what is left and expires dated lots', async () => {
    const userId = newUser()
    await wallet.adjustCoinsAsAdmin({
      userId, amountMicro: 50n * COIN, isFree: false, reason: 'expiring', adminUsername: 'test',
      expiresAt: new Date(Date.now() + 60_000),
    })
    const revoke = await wallet.adjustCoinsAsAdmin({ userId, amountMicro: -80n * COIN, isFree: false, reason: 'revoke', adminUsername: 'test' })
    expect(revoke.appliedMicro).toBe(-50n * COIN)

    await wallet.adjustCoinsAsAdmin({
      userId, amountMicro: 20n * COIN, isFree: false, reason: 'expiring 2', adminUsername: 'test',
      expiresAt: new Date(Date.now() - 1000),
    })
    // The lot's expiry is already in the past for a real "now".
    await wallet.getCoinWallet(userId)
    expect(await prisma.appCoinLedger.count({ where: { userId, type: 'expire' } })).toBe(1)
    const state = await sums(userId)
    expect(state.ledger).toBe(state.wallet)
    expect(state.lots).toBe(state.wallet)
  })

  it('grants a verified purchase once, with the bonus, and claws back only what is left on refund', async () => {
    const purchases = await import('@/server/coins/purchases')
    const userId = newUser()
    await wallet.getCoinWallet(userId)
    const verified = {
      platform: 'ios' as const,
      storeTransactionId: `tx-${randomUUID()}`,
      storeOriginalTransactionId: null,
      storeProductId: 'coin_5000',
      environment: 'sandbox' as const,
      priceAmountMicros: 4_990_000n,
      priceCurrency: 'USD',
      storefrontCountry: 'USA',
      rawPayload: { test: true },
    }
    const first = await purchases.grantVerifiedPurchase(userId, verified)
    expect(first.status).toBe('granted')
    expect(first.grantedCoins).toBe(5250)
    expect(first.wallet.paidBalance).toBe(5250)

    const again = await purchases.grantVerifiedPurchase(userId, verified)
    expect(again.status).toBe('already_granted')
    expect(again.wallet.paidBalance).toBe(5250)
    await expect(purchases.grantVerifiedPurchase(newUser(), verified)).rejects.toMatchObject({ code: 'purchase_belongs_to_another_account' })
    await expect(purchases.grantVerifiedPurchase(userId, { ...verified, storeTransactionId: 'x', storeProductId: 'nope' }))
      .rejects.toMatchObject({ code: 'unknown_product' })

    process.env.IAP_ALLOW_SANDBOX = '0'
    try {
      await expect(purchases.grantVerifiedPurchase(userId, { ...verified, storeTransactionId: `tx-${randomUUID()}` }))
        .rejects.toMatchObject({ code: 'sandbox_not_allowed' })
    } finally {
      delete process.env.IAP_ALLOW_SANDBOX
    }

    // Spend the 1,000 free coins and 250 of the purchased ones, then refund.
    await stt(userId, 25_000, `${userId}:spend`)
    expect(await purchases.refundPurchase(verified.storeTransactionId)).toBe('refunded')
    expect(await purchases.refundPurchase(verified.storeTransactionId)).toBe('already_refunded')
    expect(await purchases.refundPurchase('missing')).toBe('purchase_not_found')

    const purchase = await prisma.appIapPurchase.findUniqueOrThrow({ where: { storeTransactionId: verified.storeTransactionId } })
    expect(purchase.status).toBe('refunded')
    const meta = purchase.meta as { clawedBackMicro: string; unrecoveredMicro: string }
    expect(BigInt(meta.clawedBackMicro) + BigInt(meta.unrecoveredMicro)).toBe(5250n * COIN)
    expect(BigInt(meta.unrecoveredMicro)).toBeGreaterThan(249n * COIN)
    const state = await sums(userId)
    expect(state).toEqual({ ledger: 0n, lots: 0n, wallet: 0n })
  })

  it('lists store products per platform', async () => {
    const purchases = await import('@/server/coins/purchases')
    const products = await purchases.listCoinProducts('android')
    expect(products.map(product => [product.productId, product.totalCoins])).toEqual([
      ['coin_1000', 1000], ['coin_5000', 5250], ['coin_10000', 11000], ['coin_30000', 34500],
    ])
  })

  it('reports usage per kind and per day, and folds history per conversation', async () => {
    const queries = await import('@/server/coins/queries')
    const userId = newUser()
    await wallet.getCoinWallet(userId)
    const sessionKey = `room-${randomUUID()}`
    await wallet.chargeCoinUsage({ userId, kind: 'stt', units: { second: 600 }, idempotencyKey: `${userId}:s1`, sessionKey })
    await wallet.chargeCoinUsage({ userId, kind: 'stt', units: { second: 60 }, idempotencyKey: `${userId}:s2`, sessionKey })
    await wallet.chargeCoinUsage({
      userId, kind: 'translation', model: 'gpt-6-luna', units: { input_token: 4000, output_token: 1000 },
      idempotencyKey: `${userId}:t1`, sessionKey,
    })

    const usage = await queries.getCoinUsageSummary(userId, 'today', { tzOffsetMinutes: 540 })
    const stt = usage.kinds.find(kind => kind.kind === 'stt')!
    expect(stt.seconds).toBe(660)
    expect(stt.count).toBe(2)
    expect(stt.coins).toBeCloseTo(33, 0)
    expect(usage.kinds.find(kind => kind.kind === 'translation')!.count).toBe(1)
    expect(usage.days).toHaveLength(1)
    expect(usage.totalCoins).toBeCloseTo(usage.kinds.reduce((sum, kind) => sum + kind.coins, 0), 1)
    expect((await queries.getCoinUsageSummary(userId, '30d')).days).toHaveLength(30)

    const history = await queries.getCoinHistory(userId, null)
    expect(history.items.map(item => item.type)).toEqual(['usage', 'grant'])
    const folded = history.items[0]
    if (folded.type !== 'usage') throw new Error('expected a usage item')
    expect(folded.sttSeconds).toBe(660)
    expect(Object.keys(folded.breakdown).sort()).toEqual(['stt', 'translation'])
    expect(history.nextCursor).toBeNull()
  })

  it('records shadow charges without touching the wallet', async () => {
    const userId = newUser()
    await wallet.getCoinWallet(userId)
    process.env.COIN_BILLING_ENABLED = 'shadow'
    try {
      const result = await stt(userId, 600, `${userId}:shadow`)
      expect(result).toMatchObject({ mode: 'shadow', applied: true, balanceExhausted: false })
      expect(result.chargedMicro).toBeGreaterThan(29n * COIN)
      expect((await stt(userId, 600, `${userId}:shadow`)).duplicate).toBe(true)
      expect(await wallet.canSpendCoins(userId)).toBe(true)
    } finally {
      process.env.COIN_BILLING_ENABLED = '1'
    }
    expect((await sums(userId)).wallet).toBe(1000n * COIN)
    expect(await prisma.appCoinUsageCharge.count({ where: { userId, shadow: true } })).toBe(1)
  })

  it('finds no integrity mismatch and builds the admin dashboard', async () => {
    const admin = await import('@/server/coins/admin')
    expect(await admin.findCoinIntegrityMismatches()).toEqual([])
    const rows = await admin.loadCoinAdminDashboard(7)
    expect(rows).toHaveLength(7)
    const today = rows[rows.length - 1]
    expect(today.freeGrantedMicro).toBeGreaterThan(0n)
    expect(today.spentMicro).toBeGreaterThan(0n)
    const catalog = await admin.listCoinAdminCatalog()
    expect(catalog.products).toHaveLength(8)
    expect(catalog.rates.length).toBeGreaterThan(20)
  })

  it('closes the open price row when a new one is added', async () => {
    const admin = await import('@/server/coins/admin')
    const model = `test-model-${randomUUID()}`
    const base = { kind: 'translation' as const, provider: 'test', model, unit: 'input_token' as const, note: null, adminUsername: 'test' }
    await admin.addCoinPricingRate({ ...base, usdMicroPerMillionUnits: 100_000n, marginBps: 15_000, effectiveFrom: new Date(Date.now() - 60_000) })
    await admin.addCoinPricingRate({ ...base, usdMicroPerMillionUnits: 200_000n, marginBps: 20_000, effectiveFrom: new Date() })
    const rows = await prisma.appCoinPricingRate.findMany({ where: { model }, orderBy: { effectiveFrom: 'asc' } })
    expect(rows.map(row => [row.usdMicroPerMillionUnits, row.effectiveTo === null])).toEqual([[100_000n, false], [200_000n, true]])
    await expect(admin.addCoinPricingRate({ ...base, usdMicroPerMillionUnits: 1n, marginBps: 5_000, effectiveFrom: new Date() })).rejects.toThrow('invalid_rate')
  })
})

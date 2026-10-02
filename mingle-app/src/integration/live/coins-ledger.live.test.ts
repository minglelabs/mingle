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
})

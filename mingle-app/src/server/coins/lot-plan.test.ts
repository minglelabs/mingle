import { describe, expect, it } from 'vitest'
import { computeDailyFreeGrant, planLotSpend, type SpendableLot } from './lot-plan'

const NOW = new Date('2026-10-03T00:00:00Z')
const DAY = 24 * 60 * 60 * 1000

function lot(id: string, isFree: boolean, remaining: bigint, createdOffsetMs: number, expiresAt: Date | null = null): SpendableLot {
  return { id, isFree, remainingMicro: remaining, expiresAt, createdAt: new Date(NOW.getTime() + createdOffsetMs) }
}

describe('planLotSpend', () => {
  it('drains free lots before paid ones, oldest first within each group', () => {
    const plan = planLotSpend([
      lot('paid-new', false, 100n, -1_000),
      lot('free-new', true, 30n, -500),
      lot('paid-old', false, 50n, -9_000),
      lot('free-old', true, 20n, -8_000),
    ], 120n, NOW)

    expect(plan.allocations.map(a => [a.lotId, a.amountMicro])).toEqual([
      ['free-old', 20n],
      ['free-new', 30n],
      ['paid-old', 50n],
      ['paid-new', 20n],
    ])
    expect(plan.spentMicro).toBe(120n)
    expect(plan.shortfallMicro).toBe(0n)
  })

  it('stops at zero and reports the shortfall instead of going negative', () => {
    const plan = planLotSpend([lot('a', true, 40n, -10)], 100n, NOW)
    expect(plan.spentMicro).toBe(40n)
    expect(plan.shortfallMicro).toBe(60n)
  })

  it('skips expired and empty lots', () => {
    const plan = planLotSpend([
      lot('expired', true, 100n, -100, new Date(NOW.getTime() - 1)),
      lot('empty', true, 0n, -90),
      lot('live', false, 100n, -80, new Date(NOW.getTime() + 1)),
    ], 10n, NOW)
    expect(plan.allocations).toEqual([{ lotId: 'live', isFree: false, amountMicro: 10n }])
  })

  it('treats a non-positive amount as nothing to spend', () => {
    expect(planLotSpend([lot('a', true, 40n, -10)], -5n, NOW)).toEqual({ allocations: [], spentMicro: 0n, shortfallMicro: 0n })
  })
})

describe('computeDailyFreeGrant', () => {
  const base = { now: NOW, capMicro: 1000n, intervalMs: DAY }

  it('pays the full cap to a user who never received one', () => {
    expect(computeDailyFreeGrant({ ...base, lastDailyGrantAt: null, freeBalanceMicro: 0n })).toEqual({ due: true, amountMicro: 1000n })
  })

  it('is not due inside 24 hours', () => {
    const last = new Date(NOW.getTime() - DAY + 1)
    expect(computeDailyFreeGrant({ ...base, lastDailyGrantAt: last, freeBalanceMicro: 0n })).toEqual({ due: false, amountMicro: 0n })
  })

  it('tops the free balance up to the cap only', () => {
    const last = new Date(NOW.getTime() - DAY)
    expect(computeDailyFreeGrant({ ...base, lastDailyGrantAt: last, freeBalanceMicro: 300n }).amountMicro).toBe(700n)
    expect(computeDailyFreeGrant({ ...base, lastDailyGrantAt: last, freeBalanceMicro: 1000n })).toEqual({ due: true, amountMicro: 0n })
    expect(computeDailyFreeGrant({ ...base, lastDailyGrantAt: last, freeBalanceMicro: 5000n })).toEqual({ due: true, amountMicro: 0n })
  })

  it('pays once after a multi-day absence', () => {
    const last = new Date(NOW.getTime() - 3 * DAY)
    expect(computeDailyFreeGrant({ ...base, lastDailyGrantAt: last, freeBalanceMicro: 0n }).amountMicro).toBe(1000n)
  })
})

// Pure spend-order logic (docs/coin-iap-spec.md 3.4), kept apart from the DB so
// it can be tested exhaustively.

export type SpendableLot = {
  id: string
  isFree: boolean
  remainingMicro: bigint
  expiresAt: Date | null
  createdAt: Date
}

export type LotAllocation = { lotId: string; isFree: boolean; amountMicro: bigint }

/** Free lots first, then paid; oldest first within each group. */
export function sortLotsForSpend<T extends SpendableLot>(lots: readonly T[]): T[] {
  return [...lots].sort((left, right) => {
    if (left.isFree !== right.isFree) return left.isFree ? -1 : 1
    const byTime = left.createdAt.getTime() - right.createdAt.getTime()
    return byTime !== 0 ? byTime : left.id < right.id ? -1 : left.id > right.id ? 1 : 0
  })
}

export function isLotSpendable(lot: SpendableLot, now: Date): boolean {
  return lot.remainingMicro > 0n && (!lot.expiresAt || lot.expiresAt.getTime() > now.getTime())
}

/**
 * Takes up to amountMicro from the lots in spend order. The balance never goes
 * negative: when the lots run out, the rest is returned as shortfallMicro.
 */
export function planLotSpend(
  lots: readonly SpendableLot[],
  amountMicro: bigint,
  now: Date,
): { allocations: LotAllocation[]; spentMicro: bigint; shortfallMicro: bigint } {
  const allocations: LotAllocation[] = []
  let left = amountMicro > 0n ? amountMicro : 0n
  for (const lot of sortLotsForSpend(lots)) {
    if (left === 0n) break
    if (!isLotSpendable(lot, now)) continue
    const take = lot.remainingMicro < left ? lot.remainingMicro : left
    allocations.push({ lotId: lot.id, isFree: lot.isFree, amountMicro: take })
    left -= take
  }
  const requested = amountMicro > 0n ? amountMicro : 0n
  return { allocations, spentMicro: requested - left, shortfallMicro: left }
}

/** Daily free refill (spec 3.3): tops the free balance up to the cap, never above it. */
export function computeDailyFreeGrant(input: {
  lastDailyGrantAt: Date | null
  freeBalanceMicro: bigint
  now: Date
  capMicro: bigint
  intervalMs: number
}): { due: boolean; amountMicro: bigint } {
  const due = !input.lastDailyGrantAt
    || input.now.getTime() - input.lastDailyGrantAt.getTime() >= input.intervalMs
  if (!due) return { due: false, amountMicro: 0n }
  const missing = input.capMicro - input.freeBalanceMicro
  return { due: true, amountMicro: missing > 0n ? missing : 0n }
}

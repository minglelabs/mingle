// Coin amounts are integers of micro-coins end to end (docs/coin-iap-spec.md 3.1).
// 1 coin = 1,000,000 micro-coins = $0.001. No floating point in money math.

export const MICRO_PER_COIN = 1_000_000n
export const COINS_PER_USD = 1_000n
export const DAILY_FREE_COINS = 1_000n
export const DAILY_FREE_CAP_MICRO = DAILY_FREE_COINS * MICRO_PER_COIN
export const DAILY_FREE_INTERVAL_MS = 24 * 60 * 60 * 1000
export const LOW_BALANCE_COINS = 200n
export const LOW_BALANCE_MICRO = LOW_BALANCE_COINS * MICRO_PER_COIN
export const DEFAULT_MARGIN_BPS = 15_000

export { COIN_INSUFFICIENT_ERROR } from './coin-errors'

export function coinsToMicro(coins: number | bigint): bigint {
  return BigInt(coins) * MICRO_PER_COIN
}

/** Whole coins shown to users: always rounded down. */
export function microToDisplayCoins(micro: bigint): number {
  return Number((micro < 0n ? 0n : micro) / MICRO_PER_COIN)
}

/** Coins spent, for usage screens: a tiny charge must not read as 0, so two decimals, rounded up. */
export function microToSpentCoins(micro: bigint): number {
  const positive = micro < 0n ? -micro : micro
  const hundredths = (positive + MICRO_PER_COIN / 100n - 1n) / (MICRO_PER_COIN / 100n)
  return Number(hundredths) / 100
}

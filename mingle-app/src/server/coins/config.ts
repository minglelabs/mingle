import { MICRO_PER_COIN, SIGNUP_BONUS_MICRO } from '@/lib/coin-units'

// COIN_BILLING_ENABLED (docs/coin-iap-spec.md 6.5):
//   unset / 0 / off  -> "off": nothing is computed or recorded.
//   shadow           -> "shadow": charges are computed and recorded, wallets are
//                       untouched and nothing is blocked.
//   1 / true / on    -> "enforce": charges deduct coins and a zero balance cuts AI features.
export type CoinBillingMode = 'off' | 'shadow' | 'enforce'

export function resolveCoinBillingMode(raw: string | undefined = process.env.COIN_BILLING_ENABLED): CoinBillingMode {
  const value = (raw || '').trim().toLowerCase()
  if (value === 'shadow') return 'shadow'
  if (value === '1' || value === 'true' || value === 'on' || value === 'enforce') return 'enforce'
  return 'off'
}

export function isCoinBillingEnforced(): boolean {
  return resolveCoinBillingMode() === 'enforce'
}

/** Shared secret between this server and mingle-stt (internal charge API, STT billing tokens). */
export function readCoinInternalSecret(): string {
  return (process.env.COIN_INTERNAL_SECRET || '').trim()
}

/**
 * Free Hash given once when a wallet is first opened (COIN_SIGNUP_BONUS_COINS,
 * default 1,000; 0 turns it off). In micro-coins.
 */
export function resolveSignupBonusMicro(raw: string | undefined = process.env.COIN_SIGNUP_BONUS_COINS): bigint {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return SIGNUP_BONUS_MICRO
  const coins = Number.parseInt(trimmed, 10)
  return Number.isFinite(coins) && coins > 0 ? BigInt(coins) * MICRO_PER_COIN : 0n
}

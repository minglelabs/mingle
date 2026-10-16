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

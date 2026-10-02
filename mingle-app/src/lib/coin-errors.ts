// Shared by server and client. Kept apart from coin-units (BigInt money math)
// so client bundles do not pull that module in for one string.
export const COIN_INSUFFICIENT_ERROR = 'coin_insufficient'

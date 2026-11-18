// What each paid feature costs right now, in Hash, as the store page shows
// it. Built by the server from the live pricing rates, so a rate changed in
// /admin/coins shows here without a release.

export type CoinPriceList = {
  /** Speech recognition, per minute it runs; covers the translation of what was said. */
  voicePerMinute: number
  /** Translation read aloud, per minute of audio played. */
  readAloudPerAudioMinute: number
  /** Translation read aloud, per minute of conversation (about 22 s of audio in a minute). */
  readAloudPerConversationMinute: number
  /** One typed message translated (or one message re-translated). */
  typedMessage: number
}

export function parseCoinPriceList(value: unknown): CoinPriceList | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  const read = (key: keyof CoinPriceList) => {
    const number = record[key]
    return typeof number === 'number' && Number.isFinite(number) && number >= 0 ? number : null
  }
  const voicePerMinute = read('voicePerMinute')
  const readAloudPerAudioMinute = read('readAloudPerAudioMinute')
  const readAloudPerConversationMinute = read('readAloudPerConversationMinute')
  const typedMessage = read('typedMessage')
  if (voicePerMinute === null || readAloudPerAudioMinute === null || readAloudPerConversationMinute === null || typedMessage === null) {
    return null
  }
  return { voicePerMinute, readAloudPerAudioMinute, readAloudPerConversationMinute, typedMessage }
}

/** A price as people read it: whole Hash when it is one, one decimal below 10, else rounded. */
export function formatCoinPrice(value: number, locale: string): string {
  const digits = value >= 10 || Number.isInteger(value) ? 0 : 1
  return new Intl.NumberFormat(locale, { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(
    digits === 0 ? Math.round(value) : value,
  )
}

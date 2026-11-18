import { describe, expect, it } from 'vitest'
import { formatCoinPrice, parseCoinPriceList } from './coin-price-list'

describe('coin price list', () => {
  it('reads a complete list and refuses a partial or broken one', () => {
    const list = { voicePerMinute: 8, readAloudPerAudioMinute: 13.6, readAloudPerConversationMinute: 5, typedMessage: 0.3 }
    expect(parseCoinPriceList(list)).toEqual(list)
    expect(parseCoinPriceList({ ...list, typedMessage: undefined })).toBeNull()
    expect(parseCoinPriceList({ ...list, voicePerMinute: -1 })).toBeNull()
    expect(parseCoinPriceList(null)).toBeNull()
  })

  it('shows whole numbers whole, small prices with one decimal, large ones rounded', () => {
    expect(formatCoinPrice(8, 'ko')).toBe('8')
    expect(formatCoinPrice(8.000001, 'ko')).toBe('8')
    expect(formatCoinPrice(0.3, 'ko')).toBe('0.3')
    expect(formatCoinPrice(5.0000014, 'ko')).toBe('5')
    expect(formatCoinPrice(13.636, 'ko')).toBe('14')
  })
})

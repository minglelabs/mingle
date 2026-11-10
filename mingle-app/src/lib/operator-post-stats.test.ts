import { describe, expect, it } from 'vitest'
import {
  EMPTY_OPERATOR_POST_STATS,
  OPERATOR_POST_RATE_KEYS,
  OPERATOR_POST_STAT_KEYS,
  conversionRate,
  formatConversionRate,
  formatStatCount,
  sumOperatorPostStats,
} from './operator-post-stats'

describe('operator post stats rates', () => {
  it('divides a count by the views', () => {
    expect(conversionRate(12, 120)).toBe(0.1)
    expect(conversionRate(0, 50)).toBe(0)
  })

  it('has no rate without views', () => {
    expect(conversionRate(3, 0)).toBeNull()
    expect(conversionRate(0, 0)).toBeNull()
    expect(conversionRate(3, Number.NaN)).toBeNull()
  })

  it('does not cap a rate above 100% (a profile visit can come without a recorded view)', () => {
    expect(conversionRate(3, 2)).toBe(1.5)
  })

  it('formats a rate with at most one decimal, a floor for tiny rates and a dash without views', () => {
    expect(formatConversionRate(0.1)).toBe('10%')
    expect(formatConversionRate(0.125)).toBe('12.5%')
    expect(formatConversionRate(1 / 3)).toBe('33.3%')
    expect(formatConversionRate(0)).toBe('0%')
    expect(formatConversionRate(0.0004)).toBe('<0.1%')
    expect(formatConversionRate(null)).toBe('-')
  })

  it('formats with the given locale and falls back on an invalid one', () => {
    expect(formatConversionRate(0.125, 'fr')).toMatch(/^12,5\s%$/u)
    expect(formatStatCount(1234, 'en')).toBe('1,234')
    expect(formatStatCount(1234, 'not a locale!')).toBe('1,234')
    expect(formatConversionRate(0.5, 'not a locale!')).toBe('50%')
  })

  it('sums every count column', () => {
    const total = sumOperatorPostStats([
      { views: 10, likes: 1, comments: 2, follows: 3, profileVisits: 4, messages: 5 },
      { views: 20, likes: 2, comments: 0, follows: 1, profileVisits: 0, messages: 1 },
    ])
    expect(total).toEqual({ views: 30, likes: 3, comments: 2, follows: 4, profileVisits: 4, messages: 6 })
    expect(sumOperatorPostStats([])).toEqual(EMPTY_OPERATOR_POST_STATS)
  })

  it('lists views first and rates every other count', () => {
    expect(OPERATOR_POST_STAT_KEYS).toEqual(['views', 'likes', 'comments', 'follows', 'profileVisits', 'messages'])
    expect(OPERATOR_POST_RATE_KEYS).not.toContain('views')
  })
})

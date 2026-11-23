import { describe, expect, it } from 'vitest'
import { formatDuration, formatMetricValue } from './staff-user-stats'

describe('staff user stats formatting', () => {
  it('shows seconds as hours and minutes, Hash to 0.1, counts with separators', () => {
    expect(formatDuration(10754)).toBe('2시간 59분')
    expect(formatDuration(125)).toBe('2분')
    expect(formatDuration(42)).toBe('42초')
    expect(formatMetricValue({ unit: 'seconds' }, 0)).toBe('0')
    expect(formatMetricValue({ unit: 'hash' }, 1198.66)).toBe('1,198.7')
    expect(formatMetricValue({ unit: 'count' }, 5943)).toBe('5,943')
  })
})

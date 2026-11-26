import { describe, expect, it } from 'vitest'
import { kstDate, nextStreakDay, readAttendanceCoins } from './attendance'

describe('attendance', () => {
  it('reads the day in Korea time', () => {
    expect(kstDate(new Date('2026-11-26T14:59:00Z'))).toBe('2026-11-26')
    expect(kstDate(new Date('2026-11-26T15:00:00Z'))).toBe('2026-11-27')
  })

  it('counts a streak from yesterday, starts again after a gap, and wraps after seven', () => {
    expect(nextStreakDay(null, '2026-11-26')).toBe(1)
    expect(nextStreakDay({ date: '2026-11-25', day: 3 }, '2026-11-26')).toBe(4)
    expect(nextStreakDay({ date: '2026-11-24', day: 3 }, '2026-11-26')).toBe(1)
    expect(nextStreakDay({ date: '2026-11-25', day: 7 }, '2026-11-26')).toBe(1)
    expect(nextStreakDay({ date: '2026-11-30', day: 2 }, '2026-12-01')).toBe(3)
  })

  it('reads the amounts, 0 turning a part off', () => {
    expect(readAttendanceCoins({})).toEqual({ daily: 100, weekBonus: 300 })
    expect(readAttendanceCoins({ ATTENDANCE_DAILY_COINS: '50', ATTENDANCE_WEEK_BONUS_COINS: '0' })).toEqual({ daily: 50, weekBonus: 0 })
  })
})

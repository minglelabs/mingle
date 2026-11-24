import { describe, expect, it } from 'vitest'
import { pickScheduledPublishAt, SCHEDULE_MAX_AHEAD_MS, SCHEDULE_MIN_AHEAD_MS, utcOffsetHoursOf } from './schedule'

describe('a time picked for 예약 게시', () => {
  it('is 2 to 30 hours ahead (or that morning), on a whole minute, never in the persona\'s night', () => {
    const now = new Date('2026-11-24T09:13:27Z')
    for (let i = 0; i < 200; i += 1) {
      const at = pickScheduledPublishAt({ now, personaCountry: 'KR', random: () => (i % 100) / 100 })
      expect(at.getTime() % 60_000).toBe(0)
      expect(at.getTime()).toBeGreaterThan(now.getTime())
      expect(at.getTime()).toBeLessThanOrEqual(now.getTime() + SCHEDULE_MAX_AHEAD_MS + 11 * 3_600_000)
      const localHour = (at.getUTCHours() + utcOffsetHoursOf('KR')) % 24
      expect(localHour).toBeGreaterThanOrEqual(8)
    }
    expect(SCHEDULE_MIN_AHEAD_MS).toBe(2 * 3_600_000)
  })
})

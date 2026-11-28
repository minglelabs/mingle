import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  activityAtLocalHour,
  PRESENCE_SHARE_MAX,
  PRESENCE_SHARE_MIN,
  PRESENCE_SLOT_MS,
  presenceShareForSlot,
  selectOnlineOperators,
  utcOffsetForCountry,
} from '@/server/operator-presence'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')
const people = (country: string, count: number) => Array.from({ length: count }, (_, index) => ({ id: `${country}-${index}`, country }))

describe('operator presence', () => {
  it('keeps 10–30 % online, a share picked anew each half hour', () => {
    const shares = Array.from({ length: 200 }, (_, slot) => presenceShareForSlot(slot))
    for (const share of shares) {
      expect(share).toBeGreaterThanOrEqual(PRESENCE_SHARE_MIN)
      expect(share).toBeLessThan(PRESENCE_SHARE_MAX)
    }
    expect(new Set(shares.map((share) => share.toFixed(3))).size).toBeGreaterThan(50)
    const operators = people('KR', 200)
    const now = new Date('2026-11-25T12:00:00Z')
    const online = selectOnlineOperators(operators, now)
    const share = presenceShareForSlot(Math.floor(now.getTime() / PRESENCE_SLOT_MS))
    expect(online.length).toBe(Math.round(share * 200))
  })

  it('is the same set within a slot (several servers agree) and changes in the next', () => {
    const operators = people('KR', 100)
    const a = selectOnlineOperators(operators, new Date('2026-11-25T12:01:00Z'))
    const b = selectOnlineOperators(operators, new Date('2026-11-25T12:29:00Z'))
    const c = selectOnlineOperators(operators, new Date('2026-11-25T12:31:00Z'))
    expect(a).toEqual(b)
    expect(c).not.toEqual(a)
  })

  it('prefers countries where it is evening over those where it is the middle of the night', () => {
    // 12:00 UTC: 21:00 in Seoul, 04:00 in Los Angeles-ish (US is taken as UTC-6: 06:00).
    const operators = [...people('KR', 300), ...people('US', 300)]
    let korea = 0
    let us = 0
    for (let hour = 0; hour < 20; hour += 1) {
      const now = new Date(Date.UTC(2026, 10, 25, 12, hour * 30 % 60, 0) + Math.floor(hour / 2) * 24 * 60 * 60 * 1000)
      for (const id of selectOnlineOperators(operators, now)) {
        if (id.startsWith('KR')) korea += 1
        else us += 1
      }
    }
    expect(korea).toBeGreaterThan(us * 3)
  })

  it('knows the usual offsets and a day shape', () => {
    expect(utcOffsetForCountry('KR')).toBe(9)
    expect(utcOffsetForCountry('in')).toBe(5.5)
    expect(utcOffsetForCountry(null)).toBe(9)
    expect(activityAtLocalHour(21)).toBeGreaterThan(activityAtLocalHour(4))
  })

  it('runs from the operator automation worker, before its own rules', () => {
    expect(read('src/server/operator-automation/worker.ts')).toContain('await refreshOperatorPresence(now())')
  })
})

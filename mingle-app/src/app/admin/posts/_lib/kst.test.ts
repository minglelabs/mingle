import { describe, expect, it } from 'vitest'
import {
  formatKstDateTime,
  formatKstRange,
  formatKstTime,
  parseKstInputValue,
  roundUpToMinutes,
  toKstInputValue,
} from './kst'

describe('KST helpers', () => {
  it('formats in Korean time whatever the server time zone', () => {
    // 12:30 UTC = 21:30 KST, a Thursday.
    expect(formatKstDateTime('2026-10-01T12:30:00.000Z')).toBe('10월 1일 (목) 21:30')
    expect(formatKstTime('2026-10-01T15:05:00.000Z')).toBe('00:05')
    expect(formatKstDateTime('not a date')).toBe('')
  })

  it('shortens a range within one KST day and keeps both dates across midnight', () => {
    expect(formatKstRange('2026-10-01T05:07:00Z', '2026-10-01T10:52:00Z')).toBe('10월 1일 (목) 14:07 ~ 19:52')
    expect(formatKstRange('2026-10-01T12:00:00Z', '2026-10-01T16:10:00Z')).toBe('10월 1일 (목) 21:00 ~ 10월 2일 (금) 01:10')
    expect(formatKstRange('2026-10-01T12:00:00Z', '2026-10-01T12:00:00Z')).toBe('10월 1일 (목) 21:00')
  })

  it('round-trips datetime-local values as KST wall time', () => {
    const date = parseKstInputValue('2026-10-01T21:30')
    expect(date?.toISOString()).toBe('2026-10-01T12:30:00.000Z')
    expect(toKstInputValue(new Date('2026-10-01T12:30:00.000Z'))).toBe('2026-10-01T21:30')
  })

  it('rejects malformed and rolled-over values', () => {
    expect(parseKstInputValue('')).toBeNull()
    expect(parseKstInputValue('2026-10-01')).toBeNull()
    expect(parseKstInputValue('2026-02-31T10:00')).toBeNull()
    expect(parseKstInputValue('2026-10-01T25:00')).toBeNull()
  })

  it('rounds up to the next step', () => {
    expect(roundUpToMinutes(new Date('2026-10-01T12:31:10Z'), 10).toISOString()).toBe('2026-10-01T12:40:00.000Z')
    expect(roundUpToMinutes(new Date('2026-10-01T12:40:00Z'), 10).toISOString()).toBe('2026-10-01T12:40:00.000Z')
  })
})

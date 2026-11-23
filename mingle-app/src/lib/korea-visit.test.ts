import { describe, expect, it } from 'vitest'
import { koreaVisitEventProperties, monthGrid, parseKoreaVisitAnswer, pickKoreaVisitDay } from './korea-visit'

describe('korea visit calendar', () => {
  it('picks a trip with two taps, earlier day first, and starts over on a third', () => {
    let range = pickKoreaVisitDay({ start: null, end: null }, '2026-12-10')
    expect(range).toEqual({ start: '2026-12-10', end: null })
    range = pickKoreaVisitDay(range, '2026-12-03')
    expect(range).toEqual({ start: '2026-12-03', end: '2026-12-10' })
    range = pickKoreaVisitDay(range, '2027-01-02')
    expect(range).toEqual({ start: '2027-01-02', end: null })
    expect(pickKoreaVisitDay(range, '2027-01-02')).toEqual({ start: '2027-01-02', end: '2027-01-02' })
  })

  it('lays a month out in Sunday-first weeks', () => {
    // November 2026 starts on a Sunday and has 30 days.
    const weeks = monthGrid(2026, 10)
    expect(weeks[0][0]).toBe('2026-11-01')
    expect(weeks.every((week) => week.length === 7)).toBe(true)
    expect(weeks.flat().filter(Boolean)).toHaveLength(30)
    // December 2026 starts on a Tuesday.
    expect(monthGrid(2026, 11)[0].slice(0, 3)).toEqual([null, null, '2026-12-01'])
  })

  it('reads only a whole answer back', () => {
    expect(parseKoreaVisitAnswer('{"kind":"undecided"}')).toEqual({ kind: 'undecided' })
    expect(parseKoreaVisitAnswer('{"kind":"dates","start":"2026-12-03","end":"2026-12-10"}'))
      .toEqual({ kind: 'dates', start: '2026-12-03', end: '2026-12-10' })
    expect(parseKoreaVisitAnswer('{"kind":"dates","start":"2026-12-10","end":"2026-12-03"}')).toBeNull()
    expect(parseKoreaVisitAnswer('{oops')).toBeNull()
  })

  it('describes the trip relative to today for PostHog', () => {
    expect(koreaVisitEventProperties({ kind: 'dates', start: '2026-12-03', end: '2026-12-10' }, '2026-11-23')).toEqual({
      answer: 'dates',
      start: '2026-12-03',
      end: '2026-12-10',
      days_until_start: 10,
      trip_days: 8,
      past_trip: false,
    })
    expect(koreaVisitEventProperties({ kind: 'dates', start: '2026-10-01', end: '2026-10-05' }, '2026-11-23').past_trip).toBe(true)
  })
})

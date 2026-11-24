import { describe, expect, it } from 'vitest'
import { koreaVisitEventProperties, monthGrid, parseKoreaVisitAnswer, pickKoreaVisitDay } from './korea-visit'

describe('korea visit calendar', () => {
  it('picks the arrival, then the departure; a departure before the arrival is a new arrival', () => {
    let pick = pickKoreaVisitDay({ start: null, end: null }, '2026-12-10', 'start')
    expect(pick).toEqual({ range: { start: '2026-12-10', end: null }, field: 'end' })
    pick = pickKoreaVisitDay(pick.range, '2026-12-14', pick.field)
    expect(pick).toEqual({ range: { start: '2026-12-10', end: '2026-12-14' }, field: 'end' })
    // Tapping again changes the departure.
    expect(pickKoreaVisitDay(pick.range, '2026-12-20', 'end').range).toEqual({ start: '2026-12-10', end: '2026-12-20' })
    // Earlier than the arrival: a new arrival, the departure cleared.
    expect(pickKoreaVisitDay(pick.range, '2026-12-01', 'end').range).toEqual({ start: '2026-12-01', end: null })
    // Back on 오는 날: a new arrival keeps a departure still after it.
    expect(pickKoreaVisitDay(pick.range, '2026-12-12', 'start').range).toEqual({ start: '2026-12-12', end: '2026-12-14' })
    expect(pickKoreaVisitDay(pick.range, '2026-12-16', 'start').range).toEqual({ start: '2026-12-16', end: null })
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
    expect(parseKoreaVisitAnswer('{"kind":"dates","start":"2026-12-10","end":null}')).toEqual({ kind: 'dates', start: '2026-12-10', end: null })
    expect(parseKoreaVisitAnswer('{"kind":"visited","ago":"half_year"}')).toEqual({ kind: 'visited', ago: 'half_year' })
    expect(parseKoreaVisitAnswer('{"kind":"visited","ago":"someday"}')).toBeNull()
    expect(parseKoreaVisitAnswer('{oops')).toBeNull()
  })

  it('describes the trip relative to today for PostHog', () => {
    expect(koreaVisitEventProperties({ kind: 'dates', start: '2026-12-03', end: '2026-12-10' }, '2026-11-23')).toEqual({
      answer: 'dates',
      start: '2026-12-03',
      end: '2026-12-10',
      days_until_start: 10,
      trip_days: 8,
      has_end: true,
    })
    expect(koreaVisitEventProperties({ kind: 'dates', start: '2026-12-03', end: null }, '2026-11-23'))
      .toEqual({ answer: 'dates', start: '2026-12-03', days_until_start: 10, has_end: false })
    expect(koreaVisitEventProperties({ kind: 'visited', ago: 'older' }, '2026-11-23')).toEqual({ answer: 'visited', ago: 'older' })
  })
})

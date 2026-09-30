import { describe, expect, it } from 'vitest'
import {
  MAX_SPREAD_JITTER_MS,
  MIN_OPERATOR_GAP_MS,
  SPREAD_START_DELAY_MS,
  SPREAD_WINDOW_MS,
  planPublishTimes,
  type PublishRequest,
} from './schedule'

const NOW = new Date('2026-10-01T03:00:00.000Z')
const MIN = 60_000
const spread: PublishRequest = { kind: 'spread' }
const noJitter = () => 0

function minutesFromNow(dates: Date[]): number[] {
  return dates.map((date) => (date.getTime() - NOW.getTime()) / MIN)
}

function gapsPerOperator(operators: string[], dates: Date[]): number[] {
  const byOperator = new Map<string, number[]>()
  operators.forEach((operator, index) => {
    byOperator.set(operator, [...(byOperator.get(operator) ?? []), dates[index].getTime()])
  })
  return [...byOperator.values()].flatMap((times) => {
    const sorted = [...times].sort((a, b) => a - b)
    return sorted.slice(1).map((time, index) => time - sorted[index])
  })
}

describe('planPublishTimes', () => {
  it('spreads items evenly over 6 hours, the first one about 2 minutes from now', () => {
    const times = planPublishTimes({
      now: NOW,
      items: ['a', 'b', 'c', 'd'].map((operatorUserId) => ({ operatorUserId, request: spread })),
      random: noJitter,
    })
    expect(minutesFromNow(times)).toEqual([2, 92, 182, 272])
    expect(times.every((time) => time.getTime() < NOW.getTime() + SPREAD_START_DELAY_MS + SPREAD_WINDOW_MS)).toBe(true)
  })

  it('keeps every spread time at or after the start and inside its slot with jitter', () => {
    const times = planPublishTimes({
      now: NOW,
      items: Array.from({ length: 12 }, (_, index) => ({ operatorUserId: `op_${index}`, request: spread })),
      random: () => 0.999,
    })
    const slot = SPREAD_WINDOW_MS / 12
    const jitter = Math.min(slot / 2, MAX_SPREAD_JITTER_MS)
    times.forEach((time, index) => {
      const offset = time.getTime() - (NOW.getTime() + SPREAD_START_DELAY_MS + index * slot)
      expect(offset).toBeGreaterThanOrEqual(0)
      expect(offset).toBeLessThan(jitter)
    })
  })

  it('never puts two posts of one operator within 30 minutes, even when they do not fit in 6 hours', () => {
    const operators = Array.from({ length: 20 }, () => 'solo')
    const times = planPublishTimes({
      now: NOW,
      items: operators.map((operatorUserId) => ({ operatorUserId, request: spread })),
      random: () => 0.37,
    })
    expect(Math.min(...gapsPerOperator(operators, times))).toBeGreaterThanOrEqual(MIN_OPERATOR_GAP_MS)
    // Own order kept: the operator's posts go out in the order they were written.
    const sorted = [...times].sort((a, b) => a.getTime() - b.getTime())
    expect(times).toEqual(sorted)
  })

  it('interleaves operators instead of running one operator first', () => {
    const operators = ['a', 'a', 'a', 'b', 'b', 'b']
    const times = planPublishTimes({
      now: NOW,
      items: operators.map((operatorUserId) => ({ operatorUserId, request: spread })),
      random: noJitter,
    })
    // Slots every 60 min: a1 b1 a2 b2 a3 b3.
    expect(minutesFromNow(times)).toEqual([2, 122, 242, 62, 182, 302])
  })

  it('keeps the gap to posts the operator already has queued or published', () => {
    const times = planPublishTimes({
      now: NOW,
      items: [
        { operatorUserId: 'a', request: spread },
        { operatorUserId: 'b', request: spread },
      ],
      anchors: [
        { operatorUserId: 'a', at: new Date(NOW.getTime() - 10 * MIN) }, // published 10 min ago
        { operatorUserId: 'a', at: new Date(NOW.getTime() + 190 * MIN) }, // queued in an earlier batch
      ],
      random: noJitter,
    })
    // Slots at +2 and +182: a cannot take +2 (12 min after its last post) nor +182 (8 min before its queued one).
    const [a, b] = minutesFromNow(times)
    expect(b).toBe(2)
    expect(Math.abs(a - -10)).toBeGreaterThanOrEqual(30)
    expect(Math.abs(a - 190)).toBeGreaterThanOrEqual(30)
    expect(a).toBe(20)
  })

  it('publishes "바로 게시" items now and keeps explicit times exactly', () => {
    const at = new Date(NOW.getTime() + 3 * 60 * MIN)
    const times = planPublishTimes({
      now: NOW,
      items: [
        { operatorUserId: 'a', request: { kind: 'now' } },
        { operatorUserId: 'b', request: { kind: 'at', at } },
        { operatorUserId: 'b', request: { kind: 'at', at } },
      ],
      random: noJitter,
    })
    expect(times.map((time) => time.toISOString())).toEqual([NOW.toISOString(), at.toISOString(), at.toISOString()])
  })

  it('spaces a spread item from the same operator\'s "now" item in the same batch', () => {
    const times = planPublishTimes({
      now: NOW,
      items: [
        { operatorUserId: 'a', request: { kind: 'now' } },
        { operatorUserId: 'a', request: spread },
      ],
      random: noJitter,
    })
    expect(times[0].getTime()).toBe(NOW.getTime())
    expect(times[1].getTime() - NOW.getTime()).toBeGreaterThanOrEqual(MIN_OPERATOR_GAP_MS)
  })

  it('returns an empty plan for no items', () => {
    expect(planPublishTimes({ now: NOW, items: [] })).toEqual([])
  })
})

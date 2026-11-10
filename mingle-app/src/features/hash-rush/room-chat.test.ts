import { describe, expect, it } from 'vitest'
import {
  createChatBubbles,
  FLOAT_CRISP_MAX,
  FLOAT_CRISP_MS,
  FLOAT_FAINT_MS,
  floatLines,
  HASH_RUSH_BUBBLE_MAX,
  liveLines,
  nextFloatChange,
  refloatLines,
  seatOf,
  type HashRushBubble,
} from './room-chat'
import type { HashRushSeat } from './protocol'

const seat = (userId: string, name: string) => ({ kind: 'remote', userId, name }) as unknown as HashRushSeat
const seats = [seat('u1', 'Ann'), null as unknown as HashRushSeat, seat('u2', 'Bo')]

describe('hash rush room chat', () => {
  it('finds the seat a room member sits in', () => {
    expect(seatOf(seats, 'u2')).toBe(2)
    expect(seatOf(seats, 'nobody')).toBe(-1)
    expect(seatOf(seats, '')).toBe(-1)
    expect(seatOf(null, 'u1')).toBe(-1)
  })

  it('puts a line over its speaker and swaps the words when the translation lands', () => {
    const bubbles = new Map<number, HashRushBubble>()
    const say = createChatBubbles(bubbles, () => 1000)
    expect(say(seats, { id: 'm1', userId: 'u2', text: ' 안녕  하세요 ' }, 0)).toEqual({ seat: 2, fresh: true })
    expect(bubbles.get(2)).toMatchObject({ id: 'm1', name: 'Bo', text: '안녕 하세요', until: 1000 })
    expect(say(seats, { id: 'm1', userId: 'u2', text: 'Hello' }, 500)).toEqual({ seat: 2, fresh: false })
    expect(bubbles.get(2)).toMatchObject({ text: 'Hello', until: 1500 })
    // Once its bubble is down, a late translation raises nothing.
    expect(say(seats, { id: 'm1', userId: 'u2', text: 'Hello!' }, 2000).seat).toBe(-1)
    // Somebody not in a seat is heard (fresh) but goes over no hamster.
    expect(say(seats, { id: 'm2', userId: '', text: 'hi' }, 0)).toEqual({ seat: -1, fresh: true })
  })

  it('cuts a long line to what a bubble holds', () => {
    const bubbles = new Map<number, HashRushBubble>()
    createChatBubbles(bubbles)(seats, { id: 'm', userId: 'u1', text: 'a'.repeat(200) }, 0)
    expect(bubbles.get(0)!.text).toHaveLength(HASH_RUSH_BUBBLE_MAX)
    expect(bubbles.get(0)!.text.endsWith('…')).toBe(true)
  })

  it('floats three crisp lines at most, then faint, then gone', () => {
    const posts = ['a', 'b', 'c', 'd'].map((id) => ({ id, text: id }))
    const lines = floatLines([], posts, 0)
    expect(lines.filter((line) => line.crispUntil > 0)).toHaveLength(FLOAT_CRISP_MAX)
    expect(lines[0]).toMatchObject({ id: 'a', crispUntil: 0, goneAt: FLOAT_FAINT_MS })
    expect(nextFloatChange(lines, 0)).toBe(FLOAT_CRISP_MS)
    expect(liveLines(lines, FLOAT_FAINT_MS).map((line) => line.id)).toEqual(['b', 'c', 'd'])
    expect(liveLines(lines, FLOAT_CRISP_MS + FLOAT_FAINT_MS)).toEqual([])
    // New words make a line crisp again, in its place.
    const again = floatLines(lines, [{ id: 'b', text: 'B' }], 4000)
    expect(again.find((line) => line.id === 'b')).toMatchObject({ text: 'B', crispUntil: 4000 + FLOAT_CRISP_MS })
  })

  it('floats the last three landed lines again', () => {
    const entry = (id: string, pending = false) => ({ id, userId: 'u1', text: pending ? '' : id, orderTimeMs: 0, pending })
    const lines = refloatLines([entry('a'), entry('b'), entry('c'), entry('d'), entry('e', true)], 100)
    expect(lines.map((line) => line.id)).toEqual(['b', 'c', 'd'])
    expect(lines[0].crispUntil).toBe(100 + FLOAT_CRISP_MS)
  })
})

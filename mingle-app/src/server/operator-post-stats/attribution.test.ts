import { describe, expect, it } from 'vitest'
import {
  ATTRIBUTION_WINDOW_MS,
  attributeConversion,
  countConversions,
  type ConversionCandidateRow,
  type ConversionEvent,
} from './attribution'

const HOUR = 60 * 60 * 1000
const ACTION = new Date('2026-10-31T12:00:00.000Z')
const ago = (ms: number) => new Date(ACTION.getTime() - ms)

function follow(overrides: Partial<ConversionEvent> = {}): ConversionEvent {
  return { kind: 'follow', viewerId: 'viewer', authorId: 'author', at: ACTION, sourcePostId: null, ...overrides }
}

describe('attributeConversion', () => {
  it('uses a 24-hour window', () => {
    expect(ATTRIBUTION_WINDOW_MS).toBe(24 * HOUR)
  })

  it('credits the post the follow was made from, whatever was touched since', () => {
    expect(attributeConversion(follow({ sourcePostId: 'p-card' }), [{ postId: 'p-later', at: ago(1000) }])).toBe('p-card')
    // Even with no touch at all (e.g. a first view recorded only after the tap).
    expect(attributeConversion(follow({ sourcePostId: 'p-card' }), [])).toBe('p-card')
  })

  it('otherwise credits the most recently touched post in the window', () => {
    const touches = [
      { postId: 'p-old', at: ago(20 * HOUR) },
      { postId: 'p-recent', at: ago(2 * HOUR) },
      { postId: 'p-middle', at: ago(5 * HOUR) },
    ]
    expect(attributeConversion(follow(), touches)).toBe('p-recent')
    expect(attributeConversion(follow({ kind: 'message' }), touches)).toBe('p-recent')
  })

  it('counts a touch at the moment of the action and exactly 24 hours before it', () => {
    expect(attributeConversion(follow(), [{ postId: 'p-now', at: ACTION }])).toBe('p-now')
    expect(attributeConversion(follow(), [{ postId: 'p-edge', at: ago(24 * HOUR) }])).toBe('p-edge')
  })

  it('ignores touches after the action or older than the window', () => {
    expect(attributeConversion(follow(), [{ postId: 'p-after', at: new Date(ACTION.getTime() + 1) }])).toBeNull()
    expect(attributeConversion(follow(), [{ postId: 'p-stale', at: ago(24 * HOUR + 1) }])).toBeNull()
    expect(attributeConversion(follow(), [
      { postId: 'p-after', at: new Date(ACTION.getTime() + HOUR) },
      { postId: 'p-inside', at: ago(23 * HOUR) },
    ])).toBe('p-inside')
  })

  it('credits nothing without a touch', () => {
    expect(attributeConversion(follow(), [])).toBeNull()
  })

  it('breaks a tie on time by post id, independent of order', () => {
    const at = ago(HOUR)
    expect(attributeConversion(follow(), [{ postId: 'p-a', at }, { postId: 'p-b', at }])).toBe('p-b')
    expect(attributeConversion(follow(), [{ postId: 'p-b', at }, { postId: 'p-a', at }])).toBe('p-b')
  })

  it('honours a custom window', () => {
    expect(attributeConversion(follow(), [{ postId: 'p', at: ago(2 * HOUR) }], HOUR)).toBeNull()
  })
})

function row(overrides: Partial<ConversionCandidateRow>): ConversionCandidateRow {
  return {
    kind: 'follow',
    viewerId: 'viewer',
    authorId: 'author',
    at: ACTION,
    sourcePostId: null,
    touchPostId: null,
    touchAt: null,
    ...overrides,
  }
}

describe('countConversions', () => {
  it('groups candidate rows into one event and credits it once', () => {
    const counts = countConversions([
      row({ touchPostId: 'p1', touchAt: ago(3 * HOUR) }),
      row({ touchPostId: 'p2', touchAt: ago(1 * HOUR) }),
      row({ touchPostId: 'p1', touchAt: ago(30 * 60 * 1000) }), // profile visit from p1, after the p2 view
    ], ['p1', 'p2'])
    expect(counts.get('p1')).toEqual({ follows: 1, messages: 0 })
    expect(counts.get('p2')).toEqual({ follows: 0, messages: 0 })
  })

  it('counts follows and first messages separately, one per person', () => {
    const counts = countConversions([
      row({ viewerId: 'u1', touchPostId: 'p1', touchAt: ago(HOUR) }),
      row({ viewerId: 'u1', kind: 'message', touchPostId: 'p1', touchAt: ago(HOUR) }),
      row({ viewerId: 'u2', kind: 'message', touchPostId: 'p1', touchAt: ago(2 * HOUR) }),
      row({ viewerId: 'u3', sourcePostId: 'p1' }),
    ], ['p1'])
    expect(counts.get('p1')).toEqual({ follows: 2, messages: 2 })
  })

  it('keeps events of different authors apart', () => {
    const counts = countConversions([
      row({ authorId: 'a1', touchPostId: 'p-a1', touchAt: ago(HOUR) }),
      row({ authorId: 'a2', touchPostId: 'p-a2', touchAt: ago(HOUR) }),
    ], ['p-a1', 'p-a2'])
    expect(counts.get('p-a1')).toEqual({ follows: 1, messages: 0 })
    expect(counts.get('p-a2')).toEqual({ follows: 1, messages: 0 })
  })

  it('leaves out events credited to posts outside the list, and events without a touch', () => {
    const counts = countConversions([
      // Most recent touch is another post of the author: p1 does not get it.
      row({ viewerId: 'u1', touchPostId: 'p1', touchAt: ago(5 * HOUR) }),
      row({ viewerId: 'u1', touchPostId: 'p-other', touchAt: ago(HOUR) }),
      // No touch at all.
      row({ viewerId: 'u2' }),
      // Touched too long ago.
      row({ viewerId: 'u3', touchPostId: 'p1', touchAt: ago(25 * HOUR) }),
    ], ['p1'])
    expect([...counts.keys()]).toEqual(['p1'])
    expect(counts.get('p1')).toEqual({ follows: 0, messages: 0 })
  })

  it('returns a zero entry for every requested post', () => {
    expect(countConversions([], ['p1', 'p2'])).toEqual(new Map([
      ['p1', { follows: 0, messages: 0 }],
      ['p2', { follows: 0, messages: 0 }],
    ]))
  })
})

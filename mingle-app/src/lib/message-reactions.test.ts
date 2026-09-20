import { describe, expect, it } from 'vitest'
import { isMessageReactionKind, summarizeMessageReactions } from './message-reactions'
describe('message reactions', () => {
  it('aggregates counts in picker order and identifies the viewer reaction', () => {
    expect(summarizeMessageReactions([
      { userId: 'a', kind: 'heart' }, { userId: 'b', kind: 'like' },
      { userId: 'c', kind: 'heart' }, { userId: 'd', kind: 'unknown' },
    ], 'a')).toEqual([{ kind: 'like', count: 1, mine: false }, { kind: 'heart', count: 2, mine: true }])
  })
  it('accepts only the supported reactions', () => {
    for (const kind of ['like', 'heart', 'check', 'sad', 'laugh']) expect(isMessageReactionKind(kind)).toBe(true)
    for (const kind of ['', null, undefined, {}, '🔥']) expect(isMessageReactionKind(kind)).toBe(false)
  })
})

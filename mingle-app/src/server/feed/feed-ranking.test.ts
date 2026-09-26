import { describe, expect, it } from 'vitest'
import {
  type FeedCandidate,
  TIER_COUNT,
  avoidConsecutiveAuthors,
  decodeCursor,
  encodeCursor,
  rankFeed,
  reactionScore,
  timeTier,
} from './feed-ranking'

// ---------------------------------------------------------------------------
// timeTier
// ---------------------------------------------------------------------------
describe('timeTier', () => {
  const now = new Date('2026-09-25T12:00:00Z')

  it('returns tier 0 for posts within 1 hour', () => {
    const recent = new Date('2026-09-25T11:30:00Z') // 30 min ago
    expect(timeTier(recent, now)).toBe(0)
  })

  it('returns tier 0 for post at exactly 1 hour boundary', () => {
    const boundary = new Date('2026-09-25T11:00:00Z')
    expect(timeTier(boundary, now)).toBe(0)
  })

  it('returns tier 1 for posts between 1–6 hours', () => {
    const twoHours = new Date('2026-09-25T10:00:00Z')
    expect(timeTier(twoHours, now)).toBe(1)
  })

  it('returns tier 2 for posts between 6–24 hours', () => {
    const twelveHours = new Date('2026-09-25T00:00:00Z')
    expect(timeTier(twelveHours, now)).toBe(2)
  })

  it('returns tier 3 for posts between 24h–3 days', () => {
    const twoDays = new Date('2026-09-23T12:00:00Z')
    expect(timeTier(twoDays, now)).toBe(3)
  })

  it('returns tier 4 for posts between 3d–1 week', () => {
    const fiveDays = new Date('2026-09-20T12:00:00Z')
    expect(timeTier(fiveDays, now)).toBe(4)
  })

  it('returns tier 5 for posts between 1w–1 month', () => {
    const twoWeeks = new Date('2026-09-11T12:00:00Z')
    expect(timeTier(twoWeeks, now)).toBe(5)
  })

  it('returns tier 6 for posts older than 1 month', () => {
    const twoMonths = new Date('2026-07-25T12:00:00Z')
    expect(timeTier(twoMonths, now)).toBe(6)
  })

  it('has exactly 7 tiers (0..6)', () => {
    expect(TIER_COUNT).toBe(7)
  })
})

// ---------------------------------------------------------------------------
// reactionScore
// ---------------------------------------------------------------------------
describe('reactionScore', () => {
  it('returns 0 for no reactions', () => {
    expect(reactionScore(0, new Set())).toBe(0)
  })

  it('counts likes as ×1', () => {
    expect(reactionScore(5, new Set())).toBe(5)
  })

  it('counts unique commenters as ×2', () => {
    expect(reactionScore(0, new Set(['u1', 'u2']))).toBe(4)
  })

  it('combines likes and commenters', () => {
    expect(reactionScore(3, new Set(['u1', 'u2', 'u3']))).toBe(9)
  })
})

// ---------------------------------------------------------------------------
// rankFeed – follow priority
// ---------------------------------------------------------------------------
describe('rankFeed – follow priority', () => {
  const now = new Date('2026-09-25T12:00:00Z')

  function makeCandidate(
    id: string,
    authorId: string,
    minsAgo: number,
    viewed: boolean,
  ): FeedCandidate {
    return {
      id,
      authorId,
      publishedAt: new Date(now.getTime() - minsAgo * 60000),
      likeCount: 0,
      uniqueCommenterIds: new Set(),
      viewed,
    }
  }

  it('ranks unseen followed posts before unseen non-followed posts', () => {
    const candidates = [
      makeCandidate('p1', 'stranger', 10, false),
      makeCandidate('p2', 'friend', 10, false),
    ]
    const result = rankFeed(candidates, new Set(['friend']), now)
    expect(result[0]).toBe('p2')
    expect(result[1]).toBe('p1')
  })

  it('ranks unseen non-followed before seen followed', () => {
    const candidates = [
      makeCandidate('p1', 'friend', 10, true),  // seen, followed
      makeCandidate('p2', 'stranger', 10, false), // unseen, not followed
    ]
    const result = rankFeed(candidates, new Set(['friend']), now)
    expect(result[0]).toBe('p2')
    expect(result[1]).toBe('p1')
  })
})

// ---------------------------------------------------------------------------
// rankFeed – time tier ordering
// ---------------------------------------------------------------------------
describe('rankFeed – time tier ordering', () => {
  const now = new Date('2026-09-25T12:00:00Z')

  it('ranks more recent tier before older tier within same follow/viewed group', () => {
    const candidates: FeedCandidate[] = [
      {
        id: 'old',
        authorId: 'a1',
        publishedAt: new Date('2026-09-20T12:00:00Z'), // ~5 days, tier 4
        likeCount: 10,
        uniqueCommenterIds: new Set(['u1', 'u2', 'u3']),
        viewed: false,
      },
      {
        id: 'recent',
        authorId: 'a2',
        publishedAt: new Date('2026-09-25T11:00:00Z'), // 1 hour, tier 0
        likeCount: 0,
        uniqueCommenterIds: new Set(),
        viewed: false,
      },
    ]
    const result = rankFeed(candidates, new Set(), now)
    expect(result[0]).toBe('recent')
    expect(result[1]).toBe('old')
  })

  it('within same tier, higher reaction score comes first', () => {
    const candidates: FeedCandidate[] = [
      {
        id: 'low',
        authorId: 'a1',
        publishedAt: new Date('2026-09-25T11:30:00Z'),
        likeCount: 1,
        uniqueCommenterIds: new Set(),
        viewed: false,
      },
      {
        id: 'high',
        authorId: 'a2',
        publishedAt: new Date('2026-09-25T11:45:00Z'),
        likeCount: 5,
        uniqueCommenterIds: new Set(['u1', 'u2']),
        viewed: false,
      },
    ]
    const result = rankFeed(candidates, new Set(), now)
    expect(result[0]).toBe('high') // score: 5 + 4 = 9
    expect(result[1]).toBe('low')  // score: 1
  })
})

// ---------------------------------------------------------------------------
// rankFeed – unseen/seen partitioning with recycling
// ---------------------------------------------------------------------------
describe('rankFeed – unseen/seen partitioning', () => {
  const now = new Date('2026-09-25T12:00:00Z')

  it('places all unseen before all seen', () => {
    const candidates: FeedCandidate[] = [
      {
        id: 'seen1',
        authorId: 'a1',
        publishedAt: new Date('2026-09-25T11:30:00Z'),
        likeCount: 10,
        uniqueCommenterIds: new Set(['u1']),
        viewed: true,
      },
      {
        id: 'unseen1',
        authorId: 'a2',
        publishedAt: new Date('2026-09-25T11:00:00Z'),
        likeCount: 0,
        uniqueCommenterIds: new Set(),
        viewed: false,
      },
    ]
    const result = rankFeed(candidates, new Set(), now)
    expect(result[0]).toBe('unseen1')
    expect(result[1]).toBe('seen1')
  })
})

// ---------------------------------------------------------------------------
// avoidConsecutiveAuthors
// ---------------------------------------------------------------------------
describe('avoidConsecutiveAuthors', () => {
  it('swaps consecutive same-author posts when alternative exists', () => {
    const sorted = [
      { id: 'p1', authorId: 'alice', viewed: false, isFollowed: false, tier: 0, score: 10 },
      { id: 'p2', authorId: 'alice', viewed: false, isFollowed: false, tier: 0, score: 8 },
      { id: 'p3', authorId: 'bob',   viewed: false, isFollowed: false, tier: 0, score: 6 },
    ]
    const result = avoidConsecutiveAuthors(sorted)
    expect(result[0]).toBe('p1')
    expect(result[1]).toBe('p3') // bob swapped in
    expect(result[2]).toBe('p2')
  })

  it('does not swap when no alternative in lookahead', () => {
    const sorted = [
      { id: 'p1', authorId: 'alice', viewed: false, isFollowed: false, tier: 0, score: 10 },
      { id: 'p2', authorId: 'alice', viewed: false, isFollowed: false, tier: 0, score: 8 },
      { id: 'p3', authorId: 'alice', viewed: false, isFollowed: false, tier: 0, score: 6 },
    ]
    const result = avoidConsecutiveAuthors(sorted)
    // No swap possible – all same author
    expect(result).toEqual(['p1', 'p2', 'p3'])
  })

  it('handles single post', () => {
    const sorted = [
      { id: 'p1', authorId: 'alice', viewed: false, isFollowed: false, tier: 0, score: 10 },
    ]
    expect(avoidConsecutiveAuthors(sorted)).toEqual(['p1'])
  })

  it('handles empty list', () => {
    expect(avoidConsecutiveAuthors([])).toEqual([])
  })

  const post = (id: string, authorId: string, viewed = false, isFollowed = false) => ({
    id,
    authorId,
    viewed,
    isFollowed,
    tier: 0,
    score: 0,
  })

  it('never pulls a seen post in front of an unseen one to break a run', () => {
    const sorted = [post('u1', 'alice'), post('u2', 'alice'), post('s1', 'bob', true)]
    expect(avoidConsecutiveAuthors(sorted)).toEqual(['u1', 'u2', 's1'])
  })

  it('never pulls a non-followed post in front of a followed one', () => {
    const sorted = [
      post('f1', 'alice', false, true),
      post('f2', 'alice', false, true),
      post('n1', 'bob', false, false),
    ]
    expect(avoidConsecutiveAuthors(sorted)).toEqual(['f1', 'f2', 'n1'])
  })

  it('breaks a run across a group boundary using the next group itself', () => {
    // last unseen card is alice; the seen group starts with alice but has bob.
    const sorted = [post('u1', 'alice'), post('s1', 'alice', true), post('s2', 'bob', true)]
    expect(avoidConsecutiveAuthors(sorted)).toEqual(['u1', 's2', 's1'])
  })

  it('looks past the first few posts (whole list, no look-ahead cap)', () => {
    const sorted = [
      ...Array.from({ length: 7 }, (_, i) => post(`a${i}`, 'alice')),
      post('b0', 'bob'),
    ]
    const result = avoidConsecutiveAuthors(sorted)
    expect(result.slice(0, 3)).toEqual(['a0', 'b0', 'a1'])
  })

  it('fixes runs deep in the list, not only near the top', () => {
    const sorted = [
      post('x0', 'x'), post('y0', 'y'), post('x1', 'x'), post('y1', 'y'), post('x2', 'x'),
      post('c0', 'carol'), post('c1', 'carol'), post('d0', 'dave'),
    ]
    const result = avoidConsecutiveAuthors(sorted)
    expect(result).toEqual(['x0', 'y0', 'x1', 'y1', 'x2', 'c0', 'd0', 'c1'])
  })

  it('keeps the relative order of the posts it shifts back', () => {
    const sorted = [post('a0', 'a'), post('a1', 'a'), post('a2', 'a'), post('b0', 'b')]
    // b0 moves into slot 1; a1 then a2 keep their order behind it.
    expect(avoidConsecutiveAuthors(sorted)).toEqual(['a0', 'b0', 'a1', 'a2'])
  })

  it('avoids opening with the previous cycle\'s last author when possible', () => {
    const sorted = [post('a0', 'alice'), post('b0', 'bob'), post('a1', 'alice')]
    expect(avoidConsecutiveAuthors(sorted, 'alice')).toEqual(['b0', 'a0', 'a1'])
  })
})

// ---------------------------------------------------------------------------
// rankFeed – deterministic tiebreak
// ---------------------------------------------------------------------------
describe('rankFeed – deterministic tiebreak', () => {
  const now = new Date('2026-09-25T12:00:00Z')
  const cand = (id: string, authorId: string, publishedAt: string): FeedCandidate => ({
    id,
    authorId,
    publishedAt: new Date(publishedAt),
    likeCount: 0,
    uniqueCommenterIds: new Set(),
    viewed: false,
  })

  it('orders equal keys by publishedAt desc, then id desc, whatever the input order', () => {
    const a = cand('p-a', 'u1', '2026-09-25T11:40:00Z')
    const b = cand('p-b', 'u2', '2026-09-25T11:50:00Z')
    const c = cand('p-c', 'u3', '2026-09-25T11:50:00Z')
    const expected = ['p-c', 'p-b', 'p-a']
    expect(rankFeed([a, b, c], new Set(), now)).toEqual(expected)
    expect(rankFeed([c, a, b], new Set(), now)).toEqual(expected)
    expect(rankFeed([b, c, a], new Set(), now)).toEqual(expected)
  })

  it('passes the boundary author through to same-author avoidance', () => {
    const a0 = cand('a0', 'alice', '2026-09-25T11:50:00Z')
    const b0 = cand('b0', 'bob', '2026-09-25T11:40:00Z')
    expect(rankFeed([a0, b0], new Set(), now, { avoidFirstAuthorId: 'alice' })).toEqual(['b0', 'a0'])
  })
})

// ---------------------------------------------------------------------------
// Cursor encoding/decoding
// ---------------------------------------------------------------------------
describe('cursor encoding/decoding', () => {
  it('round-trips a cursor', () => {
    const cursor = {
      snapshotAt: '2026-09-25T12:00:00.000Z',
      offset: 42,
      viewedPhase: true,
    }
    const encoded = encodeCursor(cursor)
    const decoded = decodeCursor(encoded)
    expect(decoded).toEqual(cursor)
  })

  it('returns null for invalid base64', () => {
    expect(decodeCursor('not-valid!!!')).toBeNull()
  })

  it('returns null for valid base64 but wrong shape', () => {
    const bad = Buffer.from(JSON.stringify({ foo: 'bar' })).toString('base64url')
    expect(decodeCursor(bad)).toBeNull()
  })

  it('round-trips the restart flag and boundary author', () => {
    const cursor = {
      snapshotAt: '2026-09-25T12:00:00.000Z',
      offset: 0,
      viewedPhase: false,
      restart: true,
      avoidFirstAuthorId: 'alice',
    }
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor)
  })

  it('rejects a negative / fractional offset or an invalid date', () => {
    const enc = (v: object) => Buffer.from(JSON.stringify(v)).toString('base64url')
    expect(decodeCursor(enc({ snapshotAt: '2026-09-25T12:00:00.000Z', offset: -1, viewedPhase: false }))).toBeNull()
    expect(decodeCursor(enc({ snapshotAt: '2026-09-25T12:00:00.000Z', offset: 1.5, viewedPhase: false }))).toBeNull()
    expect(decodeCursor(enc({ snapshotAt: 'nope', offset: 0, viewedPhase: false }))).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// rankFeed – comprehensive integration
// ---------------------------------------------------------------------------
describe('rankFeed – full ranking integration', () => {
  const now = new Date('2026-09-25T12:00:00Z')

  it('produces correct full ordering: unseen-followed > unseen-stranger > seen-followed > seen-stranger', () => {
    const candidates: FeedCandidate[] = [
      {
        id: 'seen-stranger',
        authorId: 'stranger',
        publishedAt: new Date('2026-09-25T11:50:00Z'),
        likeCount: 100,
        uniqueCommenterIds: new Set(['u1', 'u2', 'u3', 'u4', 'u5']),
        viewed: true,
      },
      {
        id: 'unseen-stranger',
        authorId: 'stranger2',
        publishedAt: new Date('2026-09-25T11:30:00Z'),
        likeCount: 0,
        uniqueCommenterIds: new Set(),
        viewed: false,
      },
      {
        id: 'seen-friend',
        authorId: 'friend',
        publishedAt: new Date('2026-09-25T11:55:00Z'),
        likeCount: 50,
        uniqueCommenterIds: new Set(['u1', 'u2']),
        viewed: true,
      },
      {
        id: 'unseen-friend',
        authorId: 'friend',
        publishedAt: new Date('2026-09-25T11:45:00Z'),
        likeCount: 2,
        uniqueCommenterIds: new Set(),
        viewed: false,
      },
    ]

    const result = rankFeed(candidates, new Set(['friend']), now)

    // Expected order:
    // 1. unseen-friend (unseen + followed)
    // 2. unseen-stranger (unseen + not followed)
    // 3. seen-friend (seen + followed)
    // 4. seen-stranger (seen + not followed)
    expect(result).toEqual([
      'unseen-friend',
      'unseen-stranger',
      'seen-friend',
      'seen-stranger',
    ])
  })

  it('returns empty array for empty candidates', () => {
    expect(rankFeed([], new Set(), now)).toEqual([])
  })
})

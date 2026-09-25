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

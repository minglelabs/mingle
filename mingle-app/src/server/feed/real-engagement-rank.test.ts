import { describe, expect, it } from 'vitest'
import { rankByRealEngagement } from './feed-ranking'
import { realEngagementScore } from './real-engagement'

const at = (hours: number) => new Date(Date.UTC(2026, 10, 24, hours))

describe('feed order after the starter posts', () => {
  it('weighs follows and profile visits above likes', () => {
    expect(realEngagementScore({ follows: 1, profileVisits: 0, likes: 0, commenters: 0 })).toBeGreaterThan(realEngagementScore({ follows: 0, profileVisits: 0, likes: 3, commenters: 0 }))
    expect(realEngagementScore(undefined)).toBe(0)
  })

  it('puts unseen posts first, then the most real engagement, newest on a tie; old posts and follows give no lift', () => {
    const ids = rankByRealEngagement([
      { id: 'new-quiet', authorId: 'a', publishedAt: at(10), viewed: false, score: 0 },
      { id: 'old-loved', authorId: 'b', publishedAt: at(1), viewed: false, score: 9 },
      { id: 'seen-loved', authorId: 'c', publishedAt: at(9), viewed: true, score: 50 },
      { id: 'mid', authorId: 'd', publishedAt: at(5), viewed: false, score: 3 },
      { id: 'newer-quiet', authorId: 'e', publishedAt: at(11), viewed: false, score: 0 },
    ])
    expect(ids).toEqual(['old-loved', 'mid', 'newer-quiet', 'new-quiet', 'seen-loved'])
  })
})

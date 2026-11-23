import { describe, expect, it } from 'vitest'
import { planCommentEngagement, planPostEngagement, planRealCommentEngagement, planRealPostEngagement, seededOrder } from './engagement'

describe('post engagement plan', () => {
  it('gives text posts fewer reactions, photo posts more and striking accounts (미남미녀) far more', () => {
    const median = (appeal: { photo: boolean; attractive: boolean }, pick: 'likes' | 'comments') => {
      const counts = Array.from({ length: 2000 }, (_, index) => planPostEngagement(`post-${index}`, appeal)[pick].length).sort((a, b) => a - b)
      return counts[1000]
    }
    const text = median({ photo: false, attractive: false }, 'likes')
    const photo = median({ photo: true, attractive: false }, 'likes')
    const striking = median({ photo: true, attractive: true }, 'likes')
    expect(text).toBeLessThan(photo)
    expect(photo).toBeLessThan(striking)
    expect(striking).toBeGreaterThanOrEqual(18)
    expect(median({ photo: false, attractive: true }, 'likes')).toBeGreaterThan(text)
    expect(median({ photo: true, attractive: true }, 'comments')).toBeGreaterThan(median({ photo: false, attractive: false }, 'comments'))
    const strikingMax = Math.max(...Array.from({ length: 2000 }, (_, index) => planPostEngagement(`post-${index}`, { photo: true, attractive: true }).likes.length))
    expect(strikingMax).toBeLessThanOrEqual(48)
  })

  it('is fixed per post, with likes and comments that come in over time', () => {
    expect(planPostEngagement('p1')).toEqual(planPostEngagement('p1'))
    const plans = Array.from({ length: 2000 }, (_, index) => planPostEngagement(`post-${index}`))
    const likes = plans.map((plan) => plan.likes.length).sort((a, b) => a - b)
    expect(likes[0]).toBeGreaterThanOrEqual(1)
    expect(likes[likes.length - 1]).toBeLessThanOrEqual(24)
    expect(likes[1000]).toBeGreaterThanOrEqual(4)
    expect(likes[1000]).toBeLessThanOrEqual(10)
    const withComments = plans.filter((plan) => plan.comments.length > 0).length / plans.length
    expect(withComments).toBeGreaterThan(0.7)
    expect(withComments).toBeLessThan(0.85)
    for (const plan of plans.slice(0, 50)) {
      expect([...plan.likes].sort((a, b) => a - b)).toEqual(plan.likes)
      expect(Math.min(...plan.likes)).toBeGreaterThanOrEqual(3 * 60_000)
      expect(Math.max(...plan.likes)).toBeLessThanOrEqual(90 * 3_600_000)
    }
  })

  it('keeps reactions coming for days instead of all in the first hour', () => {
    const plans = Array.from({ length: 2000 }, (_, index) => planPostEngagement(`spread-${index}`))
    const likes = plans.flatMap((plan) => plan.likes)
    const share = (from: number, to: number) => likes.filter((at) => at >= from && at < to).length / likes.length
    expect(share(0, 3_600_000)).toBeCloseTo(0.22, 1)
    expect(share(24 * 3_600_000, 91 * 3_600_000)).toBeCloseTo(0.22, 1)
    expect(share(48 * 3_600_000, 91 * 3_600_000)).toBeGreaterThan(0.05)
    const comments = plans.flatMap((plan) => plan.comments)
    expect(comments.filter((at) => at >= 24 * 3_600_000).length / comments.length).toBeCloseTo(0.25, 1)
    expect(Math.max(...comments)).toBeLessThanOrEqual(90 * 3_600_000)
    expect(Math.min(...comments)).toBeGreaterThanOrEqual(8 * 60_000)
  })
})

describe('comment engagement plan', () => {
  it('has the author answer about half of the comments, others now and then, and likes on comments and replies', () => {
    const roots = Array.from({ length: 2000 }, (_, index) => planCommentEngagement(`c-${index}`, true))
    const share = (pick: (plan: ReturnType<typeof planCommentEngagement>) => boolean) => roots.filter(pick).length / roots.length
    expect(share((plan) => plan.authorReply !== null)).toBeCloseTo(0.45, 1)
    expect(share((plan) => plan.otherReply !== null)).toBeCloseTo(0.15, 1)
    expect(share((plan) => plan.closeLike !== null)).toBeCloseTo(0.6, 1)
    expect(share((plan) => plan.otherLikes.length > 0)).toBeCloseTo(0.5, 1)
    const replies = Array.from({ length: 2000 }, (_, index) => planCommentEngagement(`r-${index}`, false))
    expect(replies.every((plan) => plan.authorReply === null && plan.otherReply === null)).toBe(true)
    expect(replies.filter((plan) => plan.closeLike !== null).length / replies.length).toBeCloseTo(0.5, 1)
  })
})

describe('real comment engagement plan', () => {
  it('likes about 35% of real comments within hours and answers about 60% of root comments', () => {
    expect(planRealCommentEngagement('c1', true)).toEqual(planRealCommentEngagement('c1', true))
    const roots = Array.from({ length: 2000 }, (_, index) => planRealCommentEngagement(`rc-${index}`, true))
    expect(roots.every((plan) => plan.like === null || (plan.like >= 3 * 60_000 && plan.like <= 3 * 3_600_000))).toBe(true)
    expect(roots.filter((plan) => plan.like !== null).length / roots.length).toBeCloseTo(0.35, 1)
    expect(roots.filter((plan) => plan.reply !== null).length / roots.length).toBeCloseTo(0.6, 1)
    expect(roots.every((plan) => plan.reply === null || (plan.reply >= 10 * 60_000 && plan.reply <= 6 * 3_600_000))).toBe(true)
    const replies = Array.from({ length: 200 }, (_, index) => planRealCommentEngagement(`rr-${index}`, false))
    expect(replies.every((plan) => plan.reply === null)).toBe(true)
  })
})

describe('real post engagement plan', () => {
  const plans = (photo: boolean) => Array.from({ length: 2000 }, (_, index) => planRealPostEngagement(`real-${index}`, { photo }))
  const median = (values: number[]) => [...values].sort((a, b) => a - b)[1000]

  it('is fixed per post and gives a photo more likes and comments than text', () => {
    expect(planRealPostEngagement('p1', { photo: true })).toEqual(planRealPostEngagement('p1', { photo: true }))
    const text = plans(false)
    const photo = plans(true)
    expect(median(text.map((plan) => plan.likes.length))).toBeLessThan(median(photo.map((plan) => plan.likes.length)))
    expect(Math.max(...text.map((plan) => plan.likes.length))).toBeLessThanOrEqual(5)
    expect(Math.max(...photo.map((plan) => plan.likes.length))).toBeLessThanOrEqual(11)
    expect(Math.max(...text.map((plan) => plan.comments.length))).toBeLessThanOrEqual(2)
    expect(Math.max(...photo.map((plan) => plan.comments.length))).toBeLessThanOrEqual(3)
    const avg = (list: typeof text) => list.reduce((sum, plan) => sum + plan.comments.length, 0) / list.length
    expect(avg(photo)).toBeGreaterThan(avg(text))
  })

  it('likes every post within 20 minutes, then spreads the rest and the comments out', () => {
    for (const plan of [...plans(false), ...plans(true)]) {
      expect(plan.likes.length).toBeGreaterThanOrEqual(1)
      expect(plan.likes[0]).toBeGreaterThanOrEqual(60_000)
      expect(plan.likes[0]).toBeLessThanOrEqual(20 * 60_000)
      expect([...plan.likes].sort((a, b) => a - b)).toEqual(plan.likes)
      for (let index = 1; index < plan.comments.length; index += 1) {
        expect(plan.comments[index] - plan.comments[index - 1]).toBeGreaterThanOrEqual(90 * 60_000)
      }
    }
    const firstLikes = plans(true).map((plan) => plan.likes[0])
    expect(new Set(firstLikes).size).toBeGreaterThan(1000)
  })
})

describe('seededOrder', () => {
  it('picks the same accounts on every run, in a different order per seed', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f']
    expect(seededOrder(ids, 's1')).toEqual(seededOrder([...ids].reverse(), 's1'))
    expect([...seededOrder(ids, 's1')].sort()).toEqual(ids)
    expect(seededOrder(ids, 's1')).not.toEqual(seededOrder(ids, 's2'))
  })
})

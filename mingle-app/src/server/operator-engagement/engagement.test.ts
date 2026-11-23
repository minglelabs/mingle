import { describe, expect, it } from 'vitest'
import { planCommentEngagement, planPostEngagement, planRealCommentEngagement, planRealPostEngagement, seededOrder } from './engagement'

describe('post engagement plan', () => {
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
      expect(Math.max(...plan.likes)).toBeLessThanOrEqual(36 * 3_600_000)
    }
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

describe('seededOrder', () => {
  it('picks the same accounts on every run, in a different order per seed', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f']
    expect(seededOrder(ids, 's1')).toEqual(seededOrder([...ids].reverse(), 's1'))
    expect([...seededOrder(ids, 's1')].sort()).toEqual(ids)
    expect(seededOrder(ids, 's1')).not.toEqual(seededOrder(ids, 's2'))
  })
})

describe('real post engagement plan', () => {
  it('is fixed per post, with at most two comments hours apart and a few likes', () => {
    expect(planRealPostEngagement('p1')).toEqual(planRealPostEngagement('p1'))
    const plans = Array.from({ length: 2000 }, (_, index) => planRealPostEngagement(`real-${index}`))
    const share = (count: number) => plans.filter((plan) => plan.comments.length === count).length / plans.length
    expect(share(0)).toBeCloseTo(0.15, 1)
    expect(share(1)).toBeCloseTo(0.6, 1)
    expect(share(2)).toBeCloseTo(0.25, 1)
    for (const plan of plans) {
      expect(plan.comments.length).toBeLessThanOrEqual(2)
      if (plan.comments[0] !== undefined) expect(plan.comments[0]).toBeGreaterThanOrEqual(25 * 60_000)
      if (plan.comments.length === 2) expect(plan.comments[1] - plan.comments[0]).toBeGreaterThanOrEqual(2 * 3_600_000)
      expect(plan.likes.length).toBeGreaterThanOrEqual(1)
      expect(plan.likes.length).toBeLessThanOrEqual(5)
    }
  })
})

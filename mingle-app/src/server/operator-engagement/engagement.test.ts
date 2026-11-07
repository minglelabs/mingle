import { describe, expect, it } from 'vitest'
import { planCommentEngagement, planPostEngagement, seededOrder } from './engagement'

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

describe('seededOrder', () => {
  it('picks the same accounts on every run, in a different order per seed', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f']
    expect(seededOrder(ids, 's1')).toEqual(seededOrder([...ids].reverse(), 's1'))
    expect([...seededOrder(ids, 's1')].sort()).toEqual(ids)
    expect(seededOrder(ids, 's1')).not.toEqual(seededOrder(ids, 's2'))
  })
})

import { describe, expect, it } from 'vitest'
import { resolveReadBefore, visibleNotificationWhere } from './notification-visibility'

describe('visibleNotificationWhere', () => {
  it('scopes to the recipient, hides blocked actors and invisible posts', () => {
    const where = visibleNotificationWhere('u1')
    expect(where.recipientId).toBe('u1')
    const [actorRule, postRule] = where.AND as Array<{ OR: unknown[] }>
    // Team notifications pass without an actor; every other row needs an unblocked one.
    expect(actorRule.OR).toEqual([
      { actorId: null, type: { in: ['feedback_reply', 'report_reply', 'report_status'] } },
      { actor: expect.any(Object) },
    ])
    expect(postRule.OR).toEqual([
      { type: { notIn: ['post_like', 'comment', 'comment_reply', 'comment_like'] } },
      expect.objectContaining({ type: { in: ['post_like', 'comment', 'comment_reply', 'comment_like'] }, post: expect.any(Object) }),
    ])
  })
})

describe('resolveReadBefore', () => {
  const now = new Date('2026-09-26T12:00:00.000Z')

  it('uses a valid past snapshot', () => {
    expect(resolveReadBefore('2026-09-26T11:59:00.000Z', now).toISOString()).toBe('2026-09-26T11:59:00.000Z')
  })

  it('falls back to now for a missing, invalid or future value', () => {
    expect(resolveReadBefore(undefined, now)).toBe(now)
    expect(resolveReadBefore('nope', now)).toBe(now)
    expect(resolveReadBefore(123, now)).toBe(now)
    expect(resolveReadBefore('2027-01-01T00:00:00.000Z', now)).toBe(now)
  })
})

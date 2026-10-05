import { describe, expect, it } from 'vitest'
import { mergeNotificationPage, type MergeableNotification } from './notification-pages'

function item(over: Partial<MergeableNotification> & { id: string; groupKey: string }): MergeableNotification {
  return {
    isRead: true,
    createdAt: '2026-09-26T00:00:00.000Z',
    actors: [],
    actorCount: 1,
    actorIds: [],
    ...over,
  }
}

describe('mergeNotificationPage', () => {
  it('folds a like group split across pages into the entry already shown', () => {
    const page1 = [
      item({ id: 'n9', groupKey: 'post_like:p1', actors: [{ id: 'a1' }, { id: 'a2' }], actorIds: ['a1', 'a2'], actorCount: 2 }),
      item({ id: 'n8', groupKey: 'row:n8' }),
    ]
    const page2 = [
      item({ id: 'n3', groupKey: 'post_like:p1', actors: [{ id: 'a2' }, { id: 'a3' }], actorIds: ['a2', 'a3', 'a4'], actorCount: 3, isRead: false }),
      item({ id: 'n2', groupKey: 'row:n2' }),
    ]
    const merged = mergeNotificationPage(page1, page2)
    expect(merged.map((n) => n.id)).toEqual(['n9', 'n8', 'n2'])
    expect(merged[0].actorCount).toBe(4) // a1..a4, a2 not double counted
    expect(merged[0].actors.map((a) => a.id)).toEqual(['a1', 'a2', 'a3'])
    expect(merged[0].isRead).toBe(false)
  })

  it('never merges ungrouped rows and skips repeated ids', () => {
    const merged = mergeNotificationPage(
      [item({ id: 'n1', groupKey: 'row:n1' })],
      [item({ id: 'n1', groupKey: 'row:n1' }), item({ id: 'n0', groupKey: 'row:n0' })],
    )
    expect(merged.map((n) => n.id)).toEqual(['n1', 'n0'])
  })

  it('keeps a group that first appears on a later page and merges its later parts', () => {
    const merged = mergeNotificationPage(
      mergeNotificationPage([], [item({ id: 'x2', groupKey: 'comment_like:c1', actorIds: ['a1'], actors: [{ id: 'a1' }] })]),
      [item({ id: 'x1', groupKey: 'comment_like:c1', actorIds: ['a5'], actors: [{ id: 'a5' }] })],
    )
    expect(merged).toHaveLength(1)
    expect(merged[0].actorCount).toBe(2)
  })
})

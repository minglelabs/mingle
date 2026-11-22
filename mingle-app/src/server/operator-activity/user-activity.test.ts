import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  post: vi.fn(),
  comment: vi.fn(),
  postLike: vi.fn(),
  commentLike: vi.fn(),
  follow: vi.fn(),
  setting: vi.fn(),
  upsert: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    post: { findMany: m.post },
    postComment: { findMany: m.comment },
    postLike: { findMany: m.postLike },
    postCommentLike: { findMany: m.commentLike },
    userFollow: { findMany: m.follow },
    adminSetting: { findUnique: m.setting, upsert: m.upsert },
  },
}))
vi.mock('@/server/admin/audit', () => ({ writeAdminAudit: vi.fn() }))
vi.mock('@/lib/signup-welcome-onboarding', () => ({ ROYCE_USER_ID: 'royce' }))
vi.mock('@/lib/hamzzi', () => ({ HAMZZI_USER_ID: 'hamzzi' }))
vi.mock('@/server/operator-inbox/staff-translate', () => ({ STAFF_TRANSLATION_LANGUAGE: 'ko', translateForStaff: vi.fn() }))

import { listUserActivity, markUserActivityRead } from './user-activity'

const person = (id: string) => ({
  id, handle: id, name: id, image: null, imageCropScale: null, imageCropX: null, imageCropY: null, isOfficial: false, isOperator: false,
})
const post = (id: string, author: string) => ({
  id, authorId: author, sourceText: `text of ${id}`, isDeleted: false, moderationHiddenAt: null, archivedAt: null, visibility: 'public', author: person(author),
})

describe('real users activity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    for (const fn of [m.post, m.comment, m.postLike, m.commentLike, m.follow]) fn.mockResolvedValue([])
    m.setting.mockResolvedValue({ value: { at: '2026-11-22T10:00:00.000Z' } })
  })

  it('merges every source newest first and marks rows after the read line unread', async () => {
    m.post.mockResolvedValue([{ ...post('p1', 'u1'), createdAt: new Date('2026-11-22T09:00:00.000Z') }])
    m.follow.mockResolvedValue([{
      id: 'f1', createdAt: new Date('2026-11-22T11:00:00.000Z'), follower: person('u2'), following: person('u3'),
    }])
    m.postLike.mockResolvedValue([{
      id: 'l1', createdAt: new Date('2026-11-22T10:30:00.000Z'), user: person('u3'), post: post('p1', 'u1'),
    }])
    const { items, hasMore } = await listUserActivity({ limit: 10 })
    expect(items.map((item) => [item.type, item.isRead])).toEqual([
      ['user_follow', false],
      ['user_post_like', false],
      ['user_post', true],
    ])
    expect(items[1]).toMatchObject({ postId: 'p1', postExcerpt: 'text of p1', operator: null, target: { userId: 'u1' } })
    expect(hasMore).toBe(false)
    // Activity addressed to operators stays in the operator feed.
    expect(m.follow.mock.calls[0][0].where).toMatchObject({ following: { id: { notIn: ['royce', 'hamzzi'] }, isOperator: { not: true }, isOfficial: { not: true } } })
    expect(m.comment.mock.calls[0][0].where).toMatchObject({ post: { author: { isOperator: { not: true } } } })
  })

  it('pages by time and reports more when a source is full', async () => {
    m.post.mockResolvedValue([
      { ...post('p2', 'u1'), createdAt: new Date('2026-11-22T09:00:00.000Z') },
      { ...post('p1', 'u1'), createdAt: new Date('2026-11-22T08:00:00.000Z') },
    ])
    const olderThan = new Date('2026-11-22T12:00:00.000Z')
    const { items, hasMore } = await listUserActivity({ limit: 1, olderThan })
    expect(items).toHaveLength(1)
    expect(hasMore).toBe(true)
    expect(m.post.mock.calls[0][0].where.createdAt).toEqual({ lt: olderThan })
  })

  it('only moves the read line forward', async () => {
    expect(await markUserActivityRead(new Date('2026-11-22T09:00:00.000Z'))).toBe(false)
    expect(m.upsert).not.toHaveBeenCalled()
    expect(await markUserActivityRead(new Date('2026-11-22T11:00:00.000Z'))).toBe(true)
    expect(m.upsert.mock.calls[0][0].update).toEqual({ value: { at: '2026-11-22T11:00:00.000Z' } })
  })
})

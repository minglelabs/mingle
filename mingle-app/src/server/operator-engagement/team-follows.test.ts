import { describe, expect, it, vi } from 'vitest'

const { findManyUsers, findManyFollows, createMany } = vi.hoisted(() => ({ findManyUsers: vi.fn(), findManyFollows: vi.fn(), createMany: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findMany: findManyUsers }, userFollow: { findMany: findManyFollows, createMany } } }))
vi.mock('@/server/notifications/create-post-notification', () => ({ createPostNotification: vi.fn() }))
vi.mock('@/server/feed/post-view', () => ({ markPostViewed: vi.fn() }))
vi.mock('@/server/operator-comments/comment', () => ({ commentOnPostAsOperator: vi.fn(), replyToCommentAsOperator: vi.fn() }))
vi.mock('./hostile-comment', () => ({ isHostileComment: vi.fn() }))

import { HAMZZI_USER_ID } from '@/lib/hamzzi'
import { ROYCE_USER_ID } from '@/lib/signup-welcome-onboarding'
import { ensureOperatorTeamFollows } from './engagement'

describe('ensureOperatorTeamFollows', () => {
  it('adds only the missing follows both ways between operators and both team accounts', async () => {
    findManyUsers.mockResolvedValue([{ id: ROYCE_USER_ID }, { id: HAMZZI_USER_ID }])
    findManyFollows.mockResolvedValue([
      { followerId: 'op_1', followingId: HAMZZI_USER_ID },
      { followerId: HAMZZI_USER_ID, followingId: 'op_1' },
    ])
    createMany.mockImplementation(async ({ data }: { data: unknown[] }) => ({ count: data.length }))
    expect(await ensureOperatorTeamFollows(['op_1', 'op_2'])).toBe(6)
    const rows = (createMany.mock.calls[0][0] as { data: Array<{ followerId: string; followingId: string }> }).data
    expect(rows).toContainEqual({ followerId: 'op_1', followingId: ROYCE_USER_ID })
    expect(rows).toContainEqual({ followerId: ROYCE_USER_ID, followingId: 'op_1' })
    expect(rows).not.toContainEqual({ followerId: 'op_1', followingId: HAMZZI_USER_ID })
    expect(rows.filter((row) => row.followerId === 'op_2' || row.followingId === 'op_2')).toHaveLength(4)
  })

  it('writes nothing when everything is in place', async () => {
    createMany.mockClear()
    findManyUsers.mockResolvedValue([{ id: ROYCE_USER_ID }])
    findManyFollows.mockResolvedValue([{ followerId: 'op_1', followingId: ROYCE_USER_ID }, { followerId: ROYCE_USER_ID, followingId: 'op_1' }])
    expect(await ensureOperatorTeamFollows(['op_1'])).toBe(0)
    expect(createMany).not.toHaveBeenCalled()
  })
})

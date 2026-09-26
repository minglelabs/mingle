import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
  mockGetServerSession,
  mockCommentLikeFindUnique,
  mockCommentLikeDelete,
  mockCommentUpdate,
  mockCommentFindUnique,
  mockTransaction,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockCommentLikeFindUnique: vi.fn(),
  mockCommentLikeDelete: vi.fn(),
  mockCommentUpdate: vi.fn(),
  mockCommentFindUnique: vi.fn(),
  mockTransaction: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession: mockGetServerSession }))
vi.mock('@/lib/auth-options', () => ({ getAuthOptions: () => ({}) }))
vi.mock('@/server/notifications/create-post-notification', () => ({
  createPostNotification: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/server/reports/account-restriction', () => ({ accountRestrictionGuard: async () => null }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    postCommentLike: { findUnique: mockCommentLikeFindUnique, delete: mockCommentLikeDelete },
    postComment: { findUnique: mockCommentFindUnique, update: mockCommentUpdate },
    $transaction: mockTransaction,
  },
}))

import { DELETE } from './route'

const ctx = { params: Promise.resolve({ commentId: 'c1' }) }

describe('DELETE /api/comments/{commentId}/like', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } })
    mockCommentFindUnique.mockResolvedValue({ likeCount: 2 })
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        postCommentLike: { delete: mockCommentLikeDelete },
        postComment: { update: mockCommentUpdate },
      }),
    )
  })

  it('unlikes and returns the current count', async () => {
    mockCommentLikeFindUnique.mockResolvedValue({ id: 'l1' })
    const res = await DELETE(new NextRequest('http://localhost'), ctx)
    expect(await res.json()).toEqual({ liked: false, likeCount: 2 })
    expect(mockCommentUpdate).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { likeCount: { decrement: 1 } },
    })
  })

  it('treats a concurrent unlike (P2025) as success', async () => {
    mockCommentLikeFindUnique.mockResolvedValue({ id: 'l1' })
    mockCommentLikeDelete.mockRejectedValue(Object.assign(new Error('gone'), { code: 'P2025' }))
    const res = await DELETE(new NextRequest('http://localhost'), ctx)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ liked: false, likeCount: 2 })
    expect(mockCommentUpdate).not.toHaveBeenCalled()
  })

  it('returns liked=false when there was no like', async () => {
    mockCommentLikeFindUnique.mockResolvedValue(null)
    const res = await DELETE(new NextRequest('http://localhost'), ctx)
    expect(await res.json()).toEqual({ liked: false, likeCount: 2 })
  })
})

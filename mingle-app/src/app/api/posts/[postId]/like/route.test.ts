import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
  mockGetServerSession,
  mockPostFindFirst,
  mockPostLikeCreate,
  mockPostUpdate,
  mockPostLikeFindUnique,
  mockPostLikeDelete,
  mockTransaction,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockPostFindFirst: vi.fn(),
  mockPostLikeCreate: vi.fn(),
  mockPostUpdate: vi.fn(),
  mockPostLikeFindUnique: vi.fn(),
  mockPostLikeDelete: vi.fn(),
  mockTransaction: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession: mockGetServerSession }))
vi.mock('@/lib/auth-options', () => ({ getAuthOptions: () => ({}) }))
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return { ...actual, after: (fn: () => Promise<void>) => { void fn().catch(() => {}) } }
})
vi.mock('@/server/notifications/create-post-notification', () => ({
  createPostNotification: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    post: { findFirst: mockPostFindFirst, update: mockPostUpdate },
    postLike: { create: mockPostLikeCreate, findUnique: mockPostLikeFindUnique, delete: mockPostLikeDelete },
    $transaction: mockTransaction,
  },
}))

// Posting writes are gated on the moderation restriction; unrestricted here.
const { mockAccountRestrictionGuard } = vi.hoisted(() => ({
  mockAccountRestrictionGuard: vi.fn<(userId: string) => Promise<Response | null>>(async () => null),
}))
vi.mock('@/server/reports/account-restriction', () => ({
  accountRestrictionGuard: mockAccountRestrictionGuard,
}))

import { POST, DELETE } from './route'

function makeContext(postId: string) {
  return { params: Promise.resolve({ postId }) }
}

describe('POST /api/posts/{postId}/like', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } })
    mockPostFindFirst.mockResolvedValue({ id: 'post-1', authorId: 'author-1' })
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        postLike: { create: mockPostLikeCreate },
        post: { update: mockPostUpdate },
      }
      return cb(tx)
    })
  })

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)
    const res = await POST(new NextRequest('http://localhost'), makeContext('post-1'))
    expect(res.status).toBe(401)
  })

  it('returns 403 account_restricted for a restricted account, liking nothing', async () => {
    mockAccountRestrictionGuard.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'account_restricted' }), { status: 403 }))
    const res = await POST(new NextRequest('http://localhost'), makeContext('post-1'))
    expect(res.status).toBe(403)
    expect(mockPostLikeCreate).not.toHaveBeenCalled()
  })

  it('returns 404 when post not found', async () => {
    mockPostFindFirst.mockResolvedValue(null)
    const res = await POST(new NextRequest('http://localhost'), makeContext('post-1'))
    expect(res.status).toBe(404)
  })

  it('creates like and increments likeCount', async () => {
    mockPostLikeCreate.mockResolvedValue({})
    mockPostUpdate.mockResolvedValue({})

    const res = await POST(new NextRequest('http://localhost'), makeContext('post-1'))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.liked).toBe(true)
  })

  it('handles duplicate like idempotently', async () => {
    mockTransaction.mockRejectedValue({ code: 'P2002' })
    // The route catches P2002 and returns success
    // But since we mock $transaction itself rejecting, we need the route's actual catch
    // Let's re-mock to throw from inside the transaction
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        postLike: {
          create: () => { throw Object.assign(new Error(), { code: 'P2002' }) },
        },
        post: { update: mockPostUpdate },
      }
      return cb(tx)
    })

    const res = await POST(new NextRequest('http://localhost'), makeContext('post-1'))
    const body = await res.json()
    expect(body.liked).toBe(true)
    expect(body.duplicate).toBe(true)
  })
})

describe('DELETE /api/posts/{postId}/like', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } })
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        postLike: { delete: mockPostLikeDelete },
        post: { update: mockPostUpdate },
      }
      return cb(tx)
    })
  })

  it('returns liked=false when no existing like', async () => {
    mockPostLikeFindUnique.mockResolvedValue(null)
    const res = await DELETE(new NextRequest('http://localhost'), makeContext('post-1'))
    const body = await res.json()
    expect(body.liked).toBe(false)
  })

  it('deletes like and decrements likeCount', async () => {
    mockPostLikeFindUnique.mockResolvedValue({ id: 'like-1' })
    mockPostLikeDelete.mockResolvedValue({})
    mockPostUpdate.mockResolvedValue({})

    const res = await DELETE(new NextRequest('http://localhost'), makeContext('post-1'))
    const body = await res.json()
    expect(body.liked).toBe(false)
  })
})

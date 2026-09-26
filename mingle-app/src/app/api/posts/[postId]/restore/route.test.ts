import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { mockGetServerSession, mockPostFindFirst, mockPostUpdate } = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockPostFindFirst: vi.fn(),
  mockPostUpdate: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession: mockGetServerSession }))
vi.mock('@/lib/auth-options', () => ({ getAuthOptions: () => ({}) }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    post: { findFirst: mockPostFindFirst, update: mockPostUpdate },
  },
}))

// Posting writes are gated on the moderation restriction; unrestricted here.
const { mockAccountRestrictionGuard } = vi.hoisted(() => ({
  mockAccountRestrictionGuard: vi.fn<(userId: string) => Promise<Response | null>>(async () => null),
}))
vi.mock('@/server/reports/account-restriction', () => ({
  accountRestrictionGuard: mockAccountRestrictionGuard,
}))

import { POST } from './route'

const makeParams = (postId: string) => ({ params: Promise.resolve({ postId }) })
const req = () => new NextRequest('http://localhost/api/posts/p1/restore', { method: 'POST' })

describe('POST /api/posts/[postId]/restore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } })
    mockPostUpdate.mockResolvedValue({})
  })

  it('un-archives an archived post', async () => {
    mockPostFindFirst.mockResolvedValue({ id: 'p1', visibility: 'archived', isDeleted: false, deletedAt: null })
    const res = await POST(req(), makeParams('p1'))
    expect(res.status).toBe(200)
    expect((await res.json()).restored).toBe(true)
    expect(mockPostUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ visibility: 'public', archivedAt: null }) }),
    )
  })

  it('recovers a trashed post inside the 30-day window', async () => {
    mockPostFindFirst.mockResolvedValue({
      id: 'p1',
      visibility: 'public',
      isDeleted: true,
      deletedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    })
    const res = await POST(req(), makeParams('p1'))
    expect(res.status).toBe(200)
    expect(mockPostUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isDeleted: false, deletedAt: null } }),
    )
    expect((await res.json()).visibility).toBe('public')
  })

  it('returns a post deleted from the archive to the archive, not to the public feed', async () => {
    mockPostFindFirst.mockResolvedValue({
      id: 'p1',
      visibility: 'archived',
      isDeleted: true,
      deletedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    })
    const res = await POST(req(), makeParams('p1'))
    expect(res.status).toBe(200)
    expect((await res.json()).visibility).toBe('archived')
    const data = mockPostUpdate.mock.calls[0][0].data
    expect(data).toEqual({ isDeleted: false, deletedAt: null })
    expect(data).not.toHaveProperty('visibility')
  })

  it('refuses to recover a trashed post past the 30-day window', async () => {
    mockPostFindFirst.mockResolvedValue({
      id: 'p1',
      visibility: 'public',
      isDeleted: true,
      deletedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString(),
    })
    const res = await POST(req(), makeParams('p1'))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('restore_window_expired')
    expect(mockPostUpdate).not.toHaveBeenCalled()
  })

  it('returns 409 for a public, non-archived, non-trashed post', async () => {
    mockPostFindFirst.mockResolvedValue({ id: 'p1', visibility: 'public', isDeleted: false, deletedAt: null })
    const res = await POST(req(), makeParams('p1'))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('not_restorable')
  })

  it('returns 404 when the post is not the author’s', async () => {
    mockPostFindFirst.mockResolvedValue(null)
    const res = await POST(req(), makeParams('p1'))
    expect(res.status).toBe(404)
  })

  it('returns 401 when signed out', async () => {
    mockGetServerSession.mockResolvedValue(null)
    const res = await POST(req(), makeParams('p1'))
    expect(res.status).toBe(401)
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { mockGetServerSession, mockCommentFindFirst, mockUserReportCreate } = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockCommentFindFirst: vi.fn(),
  mockUserReportCreate: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession: mockGetServerSession }))
vi.mock('@/lib/auth-options', () => ({ getAuthOptions: () => ({}) }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    postComment: { findFirst: mockCommentFindFirst },
    userReport: { create: mockUserReportCreate },
  },
}))

import { POST } from '@/app/api/comments/[commentId]/report/route'

function req(body: unknown) {
  return new NextRequest('https://example.com/api/comments/c1/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/comments/[commentId]/report', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetServerSession.mockResolvedValue({ user: { id: 'reporter' } })
    mockCommentFindFirst.mockResolvedValue({ id: 'c1', authorId: 'author' })
    mockUserReportCreate.mockResolvedValue({ id: 'r1', status: 'open' })
  })

  it('creates a comment report with the comment author as reportedUserId', async () => {
    const res = await POST(req({ reason: 'harassment' }), { params: Promise.resolve({ commentId: 'c1' }) })
    expect(res.status).toBe(201)
    expect(mockUserReportCreate).toHaveBeenCalledWith({
      data: {
        reporterId: 'reporter',
        reportedUserId: 'author',
        targetType: 'comment',
        targetPostId: null,
        targetCommentId: 'c1',
        targetKey: 'comment:c1',
        reason: 'harassment',
      },
      select: { id: true, status: true },
    })
  })

  it('returns 200 already_reported on a duplicate', async () => {
    mockUserReportCreate.mockRejectedValue({ code: 'P2002' })
    const res = await POST(req({ reason: 'spam' }), { params: Promise.resolve({ commentId: 'c1' }) })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'already_reported', duplicate: true })
  })

  it('404s a comment the reporter cannot see', async () => {
    mockCommentFindFirst.mockResolvedValue(null)
    const res = await POST(req({ reason: 'spam' }), { params: Promise.resolve({ commentId: 'c1' }) })
    expect(res.status).toBe(404)
  })

  it('rejects reporting your own comment', async () => {
    mockCommentFindFirst.mockResolvedValue({ id: 'c1', authorId: 'reporter' })
    const res = await POST(req({ reason: 'spam' }), { params: Promise.resolve({ commentId: 'c1' }) })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'cannot_report_own_content' })
  })
})

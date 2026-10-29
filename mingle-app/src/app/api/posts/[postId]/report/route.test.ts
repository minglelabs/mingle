import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { mockGetServerSession, mockPostFindFirst, mockUserReportCreate } = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockPostFindFirst: vi.fn(),
  mockUserReportCreate: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession: mockGetServerSession }))
vi.mock('@/lib/auth-options', () => ({ getAuthOptions: () => ({}) }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    post: { findFirst: mockPostFindFirst },
    userReport: { create: mockUserReportCreate },
  },
}))

import { POST } from '@/app/api/posts/[postId]/report/route'

function req(body: unknown) {
  return new NextRequest('https://example.com/api/posts/p1/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/posts/[postId]/report', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetServerSession.mockResolvedValue({ user: { id: 'reporter' } })
    mockPostFindFirst.mockResolvedValue({ id: 'p1', authorId: 'author' })
    mockUserReportCreate.mockResolvedValue({ id: 'r1', status: 'open' })
  })

  it('creates a report with the author as reportedUserId and post target', async () => {
    const res = await POST(req({ reason: 'spam', message: 'ad bot' }), { params: Promise.resolve({ postId: 'p1' }) })
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ reportId: 'r1', status: 'open' })
    expect(mockUserReportCreate).toHaveBeenCalledWith({
      data: {
        reporterId: 'reporter',
        reportedUserId: 'author',
        targetType: 'post',
        targetPostId: 'p1',
        targetCommentId: null,
        targetKey: 'post:p1',
        reason: 'spam',
        message: 'ad bot',
      },
      select: { id: true, status: true },
    })
  })

  it('returns 200 already_reported on a duplicate', async () => {
    mockUserReportCreate.mockRejectedValue({ code: 'P2002' })
    const res = await POST(req({ reason: 'spam' }), { params: Promise.resolve({ postId: 'p1' }) })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'already_reported', duplicate: true })
  })

  it('rejects an unknown reason', async () => {
    const res = await POST(req({ reason: 'bad' }), { params: Promise.resolve({ postId: 'p1' }) })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_reason' })
    expect(mockUserReportCreate).not.toHaveBeenCalled()
  })

  it('404s a post the reporter cannot see', async () => {
    mockPostFindFirst.mockResolvedValue(null)
    const res = await POST(req({ reason: 'spam' }), { params: Promise.resolve({ postId: 'p1' }) })
    expect(res.status).toBe(404)
  })

  it('rejects reporting your own post', async () => {
    mockPostFindFirst.mockResolvedValue({ id: 'p1', authorId: 'reporter' })
    const res = await POST(req({ reason: 'spam' }), { params: Promise.resolve({ postId: 'p1' }) })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'cannot_report_own_content' })
  })

  it('401s a signed-out reporter', async () => {
    mockGetServerSession.mockResolvedValue(null)
    const res = await POST(req({ reason: 'spam' }), { params: Promise.resolve({ postId: 'p1' }) })
    expect(res.status).toBe(401)
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
  mockGetServerSession,
  mockPostFindMany,
  mockUserFindUnique,
  mockPostLikeFindMany,
  mockUserFollowFindMany,
  mockPostTranslationFindMany,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockPostFindMany: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockPostLikeFindMany: vi.fn(),
  mockUserFollowFindMany: vi.fn(),
  mockPostTranslationFindMany: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession: mockGetServerSession }))
vi.mock('@/lib/auth-options', () => ({ getAuthOptions: () => ({}) }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    post: { findMany: mockPostFindMany },
    user: { findUnique: mockUserFindUnique },
    postLike: { findMany: mockPostLikeFindMany },
    userFollow: { findMany: mockUserFollowFindMany },
    postTranslation: { findMany: mockPostTranslationFindMany },
  },
}))

import { GET } from './route'

describe('GET /api/account/hidden-posts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetServerSession.mockResolvedValue({ user: { id: 'me' } })
    mockUserFindUnique.mockResolvedValue({ defaultDisplayLanguage: null })
    mockPostLikeFindMany.mockResolvedValue([])
    mockUserFollowFindMany.mockResolvedValue([])
    mockPostTranslationFindMany.mockResolvedValue([])
  })

  it('401 when signed out', async () => {
    mockGetServerSession.mockResolvedValue(null)
    const res = await GET(new NextRequest('http://localhost/api/account/hidden-posts'))
    expect(res.status).toBe(401)
  })

  it('returns FeedPostListResponse and requires a PostHide by the viewer', async () => {
    mockPostFindMany.mockResolvedValue([
      {
        id: 'p1',
        authorId: 'a1',
        bodyVersion: 1,
        sourceText: 'hi',
        sourceLanguage: 'en',
        backgroundKey: 'warm-cream',
        imageObjectKey: null,
        visibility: 'public',
        deletedAt: null,
        likeCount: 0,
        commentCount: 0,
        publishedAt: new Date('2026-01-01T00:00:00.000Z'),
        author: { id: 'a1', handle: 'a', name: 'A', image: null },
      },
    ])
    const res = await GET(new NextRequest('http://localhost/api/account/hidden-posts'))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(Array.isArray(json.posts)).toBe(true)
    expect(json.nextCursor).toBeNull()
    const where = mockPostFindMany.mock.calls[0][0].where
    expect(where.hides).toEqual({ some: { userId: 'me' } })
    expect(where.visibility).toBe('public')
  })
})

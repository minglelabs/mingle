import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
  mockGetServerSession,
  mockPostFindMany,
  mockUserFindUnique,
  mockPostLikeFindMany,
  mockUserFollowFindMany,
  mockPostTranslationFindMany,
  mockPostCommentFindMany,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockPostFindMany: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockPostLikeFindMany: vi.fn(),
  mockUserFollowFindMany: vi.fn(),
  mockPostTranslationFindMany: vi.fn(),
  mockPostCommentFindMany: vi.fn(),
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
    postComment: { findMany: mockPostCommentFindMany },
  },
}))

import { GET } from './route'

function post(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    authorId: 'a1',
    bodyVersion: 1,
    sourceText: 'hello world',
    sourceLanguage: 'en',
    backgroundKey: 'warm-cream',
    imageObjectKey: null,
    visibility: 'public',
    deletedAt: null,
    likeCount: 0,
    commentCount: 0,
    publishedAt: new Date('2026-01-01T00:00:00.000Z'),
    author: { id: 'a1', handle: 'a', name: 'A', image: null },
    ...overrides,
  }
}

describe('GET /api/search/posts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetServerSession.mockResolvedValue({ user: { id: 'viewer' } })
    mockUserFindUnique.mockResolvedValue({ defaultDisplayLanguage: null })
    mockPostLikeFindMany.mockResolvedValue([])
    mockUserFollowFindMany.mockResolvedValue([])
    mockPostTranslationFindMany.mockResolvedValue([])
    mockPostCommentFindMany.mockResolvedValue([])
  })

  it('returns an empty list for a blank query without querying posts', async () => {
    const res = await GET(new NextRequest('http://localhost/api/search/posts?q=%20%20'))
    const json = await res.json()
    expect(json).toEqual({ posts: [], nextCursor: null })
    expect(mockPostFindMany).not.toHaveBeenCalled()
  })

  it('orders by reaction score (likes + unique commenters ×2) desc', async () => {
    // p1: 3 likes + 0 commenters = 3 ; p2: 1 like + 1 commenter*2 = 3 (tie) ; p3: 0+2*2=4
    mockPostFindMany.mockResolvedValue([
      post({ id: 'p1', sourceText: 'hello', likeCount: 3, publishedAt: new Date('2026-01-03') }),
      post({ id: 'p2', sourceText: 'hello', likeCount: 1, publishedAt: new Date('2026-01-02') }),
      post({ id: 'p3', sourceText: 'hello', likeCount: 0, publishedAt: new Date('2026-01-01') }),
    ])
    mockPostCommentFindMany.mockResolvedValue([
      { postId: 'p2', authorId: 'c1' },
      { postId: 'p3', authorId: 'c1' },
      { postId: 'p3', authorId: 'c2' },
    ])

    const res = await GET(new NextRequest('http://localhost/api/search/posts?q=hello'))
    const json = await res.json()
    // p3 (score 4) first; p1 & p2 tie at 3, p1 newer -> before p2
    expect(json.posts.map((p: { id: string }) => p.id)).toEqual(['p3', 'p1', 'p2'])
  })

  it('drops a post whose only match is on a stale-version translation', async () => {
    mockPostFindMany.mockResolvedValue([
      post({ id: 'p1', bodyVersion: 2, sourceText: 'no match here' }),
    ])
    // Ready translation exists but for old body version 1 -> must be ignored.
    mockPostTranslationFindMany.mockResolvedValue([
      { postId: 'p1', bodyVersion: 1, text: 'needle' },
    ])
    const res = await GET(new NextRequest('http://localhost/api/search/posts?q=needle'))
    const json = await res.json()
    expect(json.posts).toEqual([])
  })

  it('keeps a post matched by a current-version ready translation', async () => {
    mockPostFindMany.mockResolvedValue([
      post({ id: 'p1', bodyVersion: 2, sourceText: 'no match here' }),
    ])
    mockPostTranslationFindMany.mockResolvedValue([
      { postId: 'p1', bodyVersion: 2, text: 'has needle inside' },
    ])
    const res = await GET(new NextRequest('http://localhost/api/search/posts?q=NEEDLE'))
    const json = await res.json()
    expect(json.posts.map((p: { id: string }) => p.id)).toEqual(['p1'])
  })
})

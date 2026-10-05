import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
  mockGetServerSession,
  mockGetFeed,
  mockUserFindUnique,
  mockPostLikeFindMany,
  mockUserFollowFindMany,
  mockPostTranslationFindMany,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockGetFeed: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockPostLikeFindMany: vi.fn(),
  mockUserFollowFindMany: vi.fn(),
  mockPostTranslationFindMany: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession: mockGetServerSession }))
vi.mock('@/lib/auth-options', () => ({ getAuthOptions: () => ({}) }))
vi.mock('@/server/feed/feed-service', () => ({ getFeed: mockGetFeed }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: mockUserFindUnique },
    postLike: { findMany: mockPostLikeFindMany },
    userFollow: { findMany: mockUserFollowFindMany },
    postTranslation: { findMany: mockPostTranslationFindMany },
  },
}))

import { GET } from './route'

function feedRow() {
  return {
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
    viewed: false,
    author: { id: 'a1', handle: 'a', name: 'A', image: null, imageObjectKey: null },
  }
}

describe('GET /api/feed', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUserFindUnique.mockResolvedValue({ defaultDisplayLanguage: null })
    mockPostLikeFindMany.mockResolvedValue([])
    mockUserFollowFindMany.mockResolvedValue([])
    mockPostTranslationFindMany.mockResolvedValue([])
  })

  it('400 on an invalid limit', async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: 'viewer' } })
    const res = await GET(new NextRequest('http://localhost/api/feed?limit=0'))
    expect(res.status).toBe(400)
  })

  it('serves a signed-out reader with a serialized FeedPostListResponse', async () => {
    mockGetServerSession.mockResolvedValue(null)
    mockGetFeed.mockResolvedValue({ posts: [feedRow()], nextCursor: 'CUR' })

    const res = await GET(new NextRequest('http://localhost/api/feed'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(mockGetFeed).toHaveBeenCalledWith(null, null, null)
    expect(json.posts[0].id).toBe('p1')
    expect(json.posts[0].author).toEqual({ id: 'a1', handle: 'a', name: 'A', imageUrl: null })
    expect(json.posts[0].followingAuthor).toBeNull()
    expect(json.nextCursor).toBe('CUR')
  })
})

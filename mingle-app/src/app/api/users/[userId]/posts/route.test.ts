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

const makeParams = (userId: string) => ({ params: Promise.resolve({ userId }) })

function post(id: string, publishedAt: string) {
  return {
    id,
    authorId: 'author',
    bodyVersion: 1,
    sourceText: 't',
    sourceLanguage: 'en',
    backgroundKey: 'warm-cream',
    imageObjectKey: null,
    visibility: 'public',
    deletedAt: null,
    likeCount: 0,
    commentCount: 0,
    publishedAt: new Date(publishedAt),
    author: { id: 'author', handle: 'a', name: 'A', image: null },
  }
}

describe('GET /api/users/[userId]/posts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetServerSession.mockResolvedValue({ user: { id: 'viewer' } })
    mockUserFindUnique.mockResolvedValue({ defaultDisplayLanguage: null })
    mockPostLikeFindMany.mockResolvedValue([])
    mockUserFollowFindMany.mockResolvedValue([])
    mockPostTranslationFindMany.mockResolvedValue([])
  })

  it('400 on a blank user id', async () => {
    const res = await GET(new NextRequest('http://localhost/api/users/%20/posts'), makeParams(' '))
    expect(res.status).toBe(400)
  })

  it('scopes to the author and applies visibility filtering', async () => {
    mockPostFindMany.mockResolvedValue([post('p1', '2026-01-01')])
    const res = await GET(new NextRequest('http://localhost/api/users/author/posts'), makeParams('author'))
    expect(res.status).toBe(200)
    const where = mockPostFindMany.mock.calls[0][0].where
    expect(where.authorId).toBe('author')
    expect(where.visibility).toBe('public')
  })

  it('emits a nextCursor when a full page + 1 comes back', async () => {
    // limit=2 -> take=3 ; return 3 => hasMore true
    mockPostFindMany.mockResolvedValue([
      post('p1', '2026-01-03'),
      post('p2', '2026-01-02'),
      post('p3', '2026-01-01'),
    ])
    const res = await GET(
      new NextRequest('http://localhost/api/users/author/posts?limit=2'),
      makeParams('author'),
    )
    const json = await res.json()
    expect(json.posts.map((p: { id: string }) => p.id)).toEqual(['p1', 'p2'])
    expect(typeof json.nextCursor).toBe('string')
  })

  it('allows a signed-out viewer to browse', async () => {
    mockGetServerSession.mockResolvedValue(null)
    mockPostFindMany.mockResolvedValue([post('p1', '2026-01-01')])
    const res = await GET(new NextRequest('http://localhost/api/users/author/posts'), makeParams('author'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.posts[0].followingAuthor).toBeNull()
  })
})

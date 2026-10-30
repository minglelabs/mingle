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

function post(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    authorId: 'me',
    bodyVersion: 1,
    sourceText: 't',
    sourceLanguage: 'en',
    backgroundKey: 'warm-cream',
    imageObjectKey: null,
    visibility: 'archived',
    deletedAt: null,
    likeCount: 0,
    commentCount: 0,
    publishedAt: new Date('2026-01-01T00:00:00.000Z'),
    author: { id: 'me', handle: 'me', name: 'Me', image: null },
    ...overrides,
  }
}

describe('GET /api/posts/mine', () => {
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
    const res = await GET(new NextRequest('http://localhost/api/posts/mine?section=archived'))
    expect(res.status).toBe(401)
  })

  it('400 on an unknown section', async () => {
    const res = await GET(new NextRequest('http://localhost/api/posts/mine?section=nope'))
    expect(res.status).toBe(400)
  })

  it('archived: filters archived-not-deleted own posts, deletedAt null in output', async () => {
    mockPostFindMany.mockResolvedValue([post()])
    const res = await GET(new NextRequest('http://localhost/api/posts/mine?section=archived'))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.posts[0].deletedAt).toBeNull()
    const where = mockPostFindMany.mock.calls[0][0].where
    expect(where.authorId).toBe('me')
    expect(where.visibility).toBe('archived')
  })

  it('trash: applies a 30-day cutoff and surfaces deletedAt', async () => {
    const deletedAt = new Date('2026-02-01T00:00:00.000Z')
    mockPostFindMany.mockResolvedValue([post({ visibility: 'public', deletedAt })])
    const res = await GET(new NextRequest('http://localhost/api/posts/mine?section=trash'))
    const json = await res.json()
    expect(json.posts[0].deletedAt).toBe('2026-02-01T00:00:00.000Z')
    const where = mockPostFindMany.mock.calls[0][0].where
    expect(where.isDeleted).toBe(true)
    expect(where.deletedAt.gte).toBeInstanceOf(Date)
  })
})

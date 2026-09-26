import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
  mockGetServerSession,
  mockPostFindFirst,
  mockPostUpdate,
  mockUserFindUnique,
  mockRetranslatePostOnEdit,
  mockPostLikeFindMany,
  mockUserFollowFindMany,
  mockPostTranslationFindMany,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockPostFindFirst: vi.fn(),
  mockPostUpdate: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockRetranslatePostOnEdit: vi.fn(),
  mockPostLikeFindMany: vi.fn(),
  mockUserFollowFindMany: vi.fn(),
  mockPostTranslationFindMany: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession: mockGetServerSession }))
vi.mock('@/lib/auth-options', () => ({ getAuthOptions: () => ({}) }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    post: { findFirst: mockPostFindFirst, update: mockPostUpdate },
    user: { findUnique: mockUserFindUnique },
    postLike: { findMany: mockPostLikeFindMany },
    userFollow: { findMany: mockUserFollowFindMany },
    postTranslation: { findMany: mockPostTranslationFindMany },
  },
}))
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return { ...actual, after: (fn: () => Promise<void>) => { fn().catch(() => {}) } }
})
vi.mock('@/server/translation/post-translation-service', () => ({
  retranslatePostOnEdit: mockRetranslatePostOnEdit,
}))
vi.mock('@/server/posts/post-translation-repository', () => ({
  prismaTranslationDeps: {},
}))

import { GET, PATCH, DELETE } from './route'

const makeParams = (postId: string) => ({ params: Promise.resolve({ postId }) })

describe('GET /api/posts/[postId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetServerSession.mockResolvedValue({ user: { id: 'viewer-1' } })
    mockUserFindUnique.mockResolvedValue({ defaultDisplayLanguage: 'ko' })
    mockPostLikeFindMany.mockResolvedValue([])
    mockUserFollowFindMany.mockResolvedValue([])
    mockPostTranslationFindMany.mockResolvedValue([])
  })

  const visiblePost = () => ({
    id: 'p1',
    authorId: 'u1',
    bodyVersion: 1,
    sourceText: 'Hello',
    sourceLanguage: 'en',
    backgroundKey: 'warm-cream',
    imageObjectKey: null,
    visibility: 'public',
    deletedAt: null,
    likeCount: 5,
    commentCount: 2,
    publishedAt: new Date('2026-01-01T00:00:00.000Z'),
    author: { id: 'u1', handle: 'alice', name: 'Alice', image: null },
  })

  it('returns 404 if post not visible', async () => {
    mockPostFindFirst.mockResolvedValue(null)
    const req = new NextRequest('http://localhost/api/posts/p1')
    const res = await GET(req, makeParams('p1'))
    expect(res.status).toBe(404)
  })

  it('allows a signed-out viewer to read a public post', async () => {
    mockGetServerSession.mockResolvedValue(null)
    mockPostFindFirst.mockResolvedValue(visiblePost())
    const req = new NextRequest('http://localhost/api/posts/p1')
    const res = await GET(req, makeParams('p1'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.post.id).toBe('p1')
    expect(json.post.followingAuthor).toBeNull()
    expect(json.post.likedByMe).toBe(false)
  })

  it('returns FeedPostResponse with translated text when available', async () => {
    mockPostFindFirst.mockResolvedValue(visiblePost())
    mockPostTranslationFindMany.mockResolvedValue([
      { postId: 'p1', bodyVersion: 1, language: 'ko', status: 'ready', text: '안녕하세요' },
    ])

    const req = new NextRequest('http://localhost/api/posts/p1')
    const res = await GET(req, makeParams('p1'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.post.translationState).toBe('ready')
    expect(json.post.displayText).toBe('안녕하세요')
    expect(json.post.displayLanguage).toBe('ko')
  })
})

describe('PATCH /api/posts/[postId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } })
    mockRetranslatePostOnEdit.mockResolvedValue({})
  })

  it('returns 404 if post does not belong to user', async () => {
    mockPostFindFirst.mockResolvedValue(null)
    const req = new NextRequest('http://localhost/api/posts/p1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceText: 'updated' }),
    })
    const res = await PATCH(req, makeParams('p1'))
    expect(res.status).toBe(404)
  })

  it('increments bodyVersion on text change', async () => {
    mockPostFindFirst.mockResolvedValue({
      id: 'p1', authorId: 'user-1', bodyVersion: 1, imageObjectKey: null,
    })
    mockPostUpdate.mockResolvedValue({
      id: 'p1', bodyVersion: 2, backgroundKey: 'solid-white', updatedAt: new Date(),
      sourceText: 'updated', sourceLanguage: 'en',
    })

    const req = new NextRequest('http://localhost/api/posts/p1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceText: 'updated' }),
    })
    const res = await PATCH(req, makeParams('p1'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.bodyVersion).toBe(2)
  })
})

describe('DELETE /api/posts/[postId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } })
  })

  it('soft-deletes the post', async () => {
    mockPostFindFirst.mockResolvedValue({ id: 'p1', authorId: 'user-1' })
    mockPostUpdate.mockResolvedValue({ id: 'p1', isDeleted: true })

    const req = new NextRequest('http://localhost/api/posts/p1', { method: 'DELETE' })
    const res = await DELETE(req, makeParams('p1'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.deleted).toBe(true)
    expect(mockPostUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ isDeleted: true }),
    }))
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
  mockGetServerSession,
  mockPostFindFirst,
  mockCommentFindMany,
  mockCommentLikeFindMany,
  mockCreateComment,
  mockDeleteComment,
  mockTranslateCommentOnDemand,
  mockResolveDefaultPostTranslationLanguages,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockPostFindFirst: vi.fn(),
  mockCommentFindMany: vi.fn(),
  mockCommentLikeFindMany: vi.fn(),
  mockCreateComment: vi.fn(),
  mockDeleteComment: vi.fn(),
  mockTranslateCommentOnDemand: vi.fn(),
  mockResolveDefaultPostTranslationLanguages: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession: mockGetServerSession }))
vi.mock('@/lib/auth-options', () => ({ getAuthOptions: () => ({}) }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    post: { findFirst: mockPostFindFirst },
    postComment: { findMany: mockCommentFindMany },
    postCommentLike: { findMany: mockCommentLikeFindMany },
  },
}))
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return { ...actual, after: (fn: () => Promise<void>) => { fn().catch(() => {}) } }
})
vi.mock('@/server/posts/comment-service', () => ({
  createComment: mockCreateComment,
  deleteComment: mockDeleteComment,
}))
vi.mock('@/server/translation/post-translation-service', () => ({
  translateCommentOnDemand: mockTranslateCommentOnDemand,
  resolveDefaultPostTranslationLanguages: mockResolveDefaultPostTranslationLanguages,
}))
vi.mock('@/server/posts/post-translation-repository', () => ({
  prismaTranslationDeps: {},
}))

import { GET, POST } from './route'

function makeCtx(postId: string) {
  return { params: Promise.resolve({ postId }) }
}

function makeRequest(body?: unknown): NextRequest {
  return new NextRequest('http://localhost/api/posts/post-1/comments', {
    method: body ? 'POST' : 'GET',
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  })
}

describe('GET /api/posts/{postId}/comments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } })
    mockPostFindFirst.mockResolvedValue({ id: 'post-1' })
    mockCommentLikeFindMany.mockResolvedValue([])
  })

  it('returns 401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)
    const res = await GET(makeRequest(), makeCtx('post-1'))
    expect(res.status).toBe(401)
  })

  it('returns 404 when post not visible', async () => {
    mockPostFindFirst.mockResolvedValue(null)
    const res = await GET(makeRequest(), makeCtx('post-1'))
    expect(res.status).toBe(404)
  })

  it('returns threaded comments with deleted parent sourceText=null', async () => {
    mockCommentFindMany.mockResolvedValue([
      {
        id: 'c1', postId: 'post-1', authorId: 'u1', parentId: null,
        replyToUserId: null, bodyVersion: 1, sourceText: 'Original', sourceLanguage: 'en',
        likeCount: 0, isDeleted: true, createdAt: new Date(), updatedAt: new Date(),
        author: { id: 'u1', handle: 'h1', displayName: 'd1', profileImageUrl: null },
        replyToUser: null, _count: { replies: 1 },
      },
      {
        id: 'c2', postId: 'post-1', authorId: 'u2', parentId: 'c1',
        replyToUserId: 'u1', bodyVersion: 1, sourceText: 'Reply', sourceLanguage: 'ko',
        likeCount: 2, isDeleted: null, createdAt: new Date(), updatedAt: new Date(),
        author: { id: 'u2', handle: 'h2', displayName: 'd2', profileImageUrl: null },
        replyToUser: { id: 'u1', handle: 'h1', displayName: 'd1' }, _count: { replies: 0 },
      },
    ])

    const res = await GET(makeRequest(), makeCtx('post-1'))
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.comments).toHaveLength(1)
    const parent = body.comments[0]
    expect(parent.isDeleted).toBe(true)
    expect(parent.sourceText).toBeNull()  // redacted
    expect(parent.replies).toHaveLength(1)
    expect(parent.replies[0].sourceText).toBe('Reply')
  })

  it('drops a deleted comment once no live reply keeps it', async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: 'viewer' } })
    mockPostFindFirst.mockResolvedValue({ id: 'post-1' })
    mockCommentLikeFindMany.mockResolvedValue([])
    // A deleted parent whose only reply was also deleted, plus a live comment.
    // The parent is kept alive by replies alone, so it must disappear here.
    mockCommentFindMany.mockResolvedValue([
      {
        id: 'c1', postId: 'post-1', authorId: 'u1', parentId: null,
        replyToUserId: null, bodyVersion: 1, sourceText: 'Gone', sourceLanguage: 'en',
        likeCount: 0, isDeleted: true, createdAt: new Date(), updatedAt: new Date(),
        author: { id: 'u1', handle: 'h1', displayName: 'd1', profileImageUrl: null },
        replyToUser: null, _count: { replies: 1 },
      },
      {
        id: 'c2', postId: 'post-1', authorId: 'u2', parentId: 'c1',
        replyToUserId: 'u1', bodyVersion: 1, sourceText: 'Gone too', sourceLanguage: 'ko',
        likeCount: 0, isDeleted: true, createdAt: new Date(), updatedAt: new Date(),
        author: { id: 'u2', handle: 'h2', displayName: 'd2', profileImageUrl: null },
        replyToUser: null, _count: { replies: 0 },
      },
      {
        id: 'c3', postId: 'post-1', authorId: 'u3', parentId: null,
        replyToUserId: null, bodyVersion: 1, sourceText: 'Alive', sourceLanguage: 'en',
        likeCount: 0, isDeleted: null, createdAt: new Date(), updatedAt: new Date(),
        author: { id: 'u3', handle: 'h3', displayName: 'd3', profileImageUrl: null },
        replyToUser: null, _count: { replies: 0 },
      },
    ])

    const res = await GET(makeRequest(), makeCtx('post-1'))
    const body = await res.json()

    expect(body.comments.map((c: { id: string }) => c.id)).toEqual(['c3'])
  })

  it('counts only live replies in replyCount', async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: 'viewer' } })
    mockPostFindFirst.mockResolvedValue({ id: 'post-1' })
    mockCommentLikeFindMany.mockResolvedValue([])
    // _count.replies is 2 in the DB, but one reply is deleted. Reporting 2
    // would advertise a reply the client never receives.
    mockCommentFindMany.mockResolvedValue([
      {
        id: 'c1', postId: 'post-1', authorId: 'u1', parentId: null,
        replyToUserId: null, bodyVersion: 1, sourceText: 'Parent', sourceLanguage: 'en',
        likeCount: 0, isDeleted: null, createdAt: new Date(), updatedAt: new Date(),
        author: { id: 'u1', handle: 'h1', displayName: 'd1', profileImageUrl: null },
        replyToUser: null, _count: { replies: 2 },
      },
      {
        id: 'c2', postId: 'post-1', authorId: 'u2', parentId: 'c1',
        replyToUserId: null, bodyVersion: 1, sourceText: 'Live', sourceLanguage: 'en',
        likeCount: 0, isDeleted: null, createdAt: new Date(), updatedAt: new Date(),
        author: { id: 'u2', handle: 'h2', displayName: 'd2', profileImageUrl: null },
        replyToUser: null, _count: { replies: 0 },
      },
      {
        id: 'c3', postId: 'post-1', authorId: 'u3', parentId: 'c1',
        replyToUserId: null, bodyVersion: 1, sourceText: 'Deleted', sourceLanguage: 'en',
        likeCount: 0, isDeleted: true, createdAt: new Date(), updatedAt: new Date(),
        author: { id: 'u3', handle: 'h3', displayName: 'd3', profileImageUrl: null },
        replyToUser: null, _count: { replies: 0 },
      },
    ])

    const res = await GET(makeRequest(), makeCtx('post-1'))
    const body = await res.json()

    expect(body.comments[0].replyCount).toBe(1)
    expect(body.comments[0].replies.map((r: { id: string }) => r.id)).toEqual(['c2'])
  })
})

describe('POST /api/posts/{postId}/comments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } })
    mockPostFindFirst.mockResolvedValue({ id: 'post-1' })
    mockResolveDefaultPostTranslationLanguages.mockReturnValue(['en', 'ja', 'ko'])
    mockTranslateCommentOnDemand.mockResolvedValue('translated')
  })

  it('returns 400 when no text', async () => {
    const res = await POST(makeRequest({}), makeCtx('post-1'))
    expect(res.status).toBe(400)
  })

  it('returns 400 when text exceeds 500 chars', async () => {
    const res = await POST(makeRequest({ sourceText: 'a'.repeat(501), sourceLanguage: 'en' }), makeCtx('post-1'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('text_too_long')
  })

  it('creates comment successfully', async () => {
    mockCreateComment.mockResolvedValue({
      id: 'c1', postId: 'post-1', parentId: null,
      replyToUserId: null, bodyVersion: 1, createdAt: new Date(),
    })

    const res = await POST(
      makeRequest({ sourceText: 'Nice post!', sourceLanguage: 'en' }),
      makeCtx('post-1'),
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.id).toBe('c1')
  })

  it('returns 400 for invalid parentId', async () => {
    mockCreateComment.mockRejectedValue(new Error('parent_not_found'))

    const res = await POST(
      makeRequest({ sourceText: 'reply', sourceLanguage: 'en', parentId: 'bad' }),
      makeCtx('post-1'),
    )
    expect(res.status).toBe(400)
  })
})

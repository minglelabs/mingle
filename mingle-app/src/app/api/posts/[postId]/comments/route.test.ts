import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
  mockGetServerSession,
  mockPostFindFirst,
  mockCommentFindMany,
  mockCommentLikeFindMany,
  mockUserFindUnique,
  mockCreateComment,
  mockDeleteComment,
  mockDetectSourceLanguage,
  mockTranslateCommentBodySettled,
  mockResolveDefaultPostTranslationLanguages,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockPostFindFirst: vi.fn(),
  mockCommentFindMany: vi.fn(),
  mockCommentLikeFindMany: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockCreateComment: vi.fn(),
  mockDeleteComment: vi.fn(),
  mockDetectSourceLanguage: vi.fn(),
  mockTranslateCommentBodySettled: vi.fn(),
  mockResolveDefaultPostTranslationLanguages: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession: mockGetServerSession }))
vi.mock('@/lib/auth-options', () => ({ getAuthOptions: () => ({}) }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    post: { findFirst: mockPostFindFirst },
    postComment: { findMany: mockCommentFindMany },
    postCommentLike: { findMany: mockCommentLikeFindMany },
    user: { findUnique: mockUserFindUnique },
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
vi.mock('@/server/translation/detect-source-language', () => ({
  detectSourceLanguage: mockDetectSourceLanguage,
}))
vi.mock('@/server/translation/post-translation-service', () => ({
  translateCommentBodySettled: mockTranslateCommentBodySettled,
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
    mockPostFindFirst.mockResolvedValue({ id: 'post-1', commentCount: 0 })
    mockCommentLikeFindMany.mockResolvedValue([])
    mockUserFindUnique.mockResolvedValue({ defaultDisplayLanguage: null })
  })

  it('returns 200 with an empty list when there are no comments', async () => {
    mockCommentFindMany.mockResolvedValue([])
    const res = await GET(makeRequest(), makeCtx('post-1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.comments).toEqual([])
    expect(body.commentCount).toBe(0)
  })

  it('lets a signed-out viewer read the list', async () => {
    mockGetServerSession.mockResolvedValue(null)
    mockCommentFindMany.mockResolvedValue([])
    const res = await GET(makeRequest(), makeCtx('post-1'))
    expect(res.status).toBe(200)
    // No block filtering / no likes lookup when signed out.
    expect(mockCommentLikeFindMany).not.toHaveBeenCalled()
    expect(mockUserFindUnique).not.toHaveBeenCalled()
  })

  it('returns 404 when post not visible', async () => {
    mockPostFindFirst.mockResolvedValue(null)
    const res = await GET(makeRequest(), makeCtx('post-1'))
    expect(res.status).toBe(404)
  })

  it('exposes the post commentCount for onCommentCountChange', async () => {
    mockPostFindFirst.mockResolvedValue({ id: 'post-1', commentCount: 7 })
    mockCommentFindMany.mockResolvedValue([])
    const res = await GET(makeRequest(), makeCtx('post-1'))
    const body = await res.json()
    expect(body.commentCount).toBe(7)
  })

  it('returns threaded comments with deleted parent sourceText=null', async () => {
    mockCommentFindMany.mockResolvedValue([
      {
        id: 'c1', postId: 'post-1', authorId: 'u1', parentId: null,
        replyToUserId: null, bodyVersion: 1, sourceText: 'Original', sourceLanguage: 'en',
        likeCount: 0, isDeleted: true, createdAt: new Date(), updatedAt: new Date(),
        author: { id: 'u1', handle: 'h1', name: 'd1', image: null },
        replyToUser: null, _count: { replies: 1 }, translations: [],
      },
      {
        id: 'c2', postId: 'post-1', authorId: 'u2', parentId: 'c1',
        replyToUserId: 'u1', bodyVersion: 1, sourceText: 'Reply', sourceLanguage: 'ko',
        likeCount: 2, isDeleted: null, createdAt: new Date(), updatedAt: new Date(),
        author: { id: 'u2', handle: 'h2', name: 'd2', image: null },
        replyToUser: { id: 'u1', handle: 'h1', name: 'd1' }, _count: { replies: 0 }, translations: [],
      },
    ])

    const res = await GET(makeRequest(), makeCtx('post-1'))
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.comments).toHaveLength(1)
    const parent = body.comments[0]
    expect(parent.isDeleted).toBe(true)
    expect(parent.sourceText).toBeNull()  // redacted
    expect(parent.displayText).toBeNull()
    expect(parent.replies).toHaveLength(1)
    expect(parent.replies[0].sourceText).toBe('Reply')
  })

  it('drops a deleted comment once no live reply keeps it', async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: 'viewer' } })
    mockPostFindFirst.mockResolvedValue({ id: 'post-1', commentCount: 1 })
    mockCommentLikeFindMany.mockResolvedValue([])
    // A deleted parent whose only reply was also deleted, plus a live comment.
    // The parent is kept alive by replies alone, so it must disappear here.
    mockCommentFindMany.mockResolvedValue([
      {
        id: 'c1', postId: 'post-1', authorId: 'u1', parentId: null,
        replyToUserId: null, bodyVersion: 1, sourceText: 'Gone', sourceLanguage: 'en',
        likeCount: 0, isDeleted: true, createdAt: new Date(), updatedAt: new Date(),
        author: { id: 'u1', handle: 'h1', name: 'd1', image: null },
        replyToUser: null, _count: { replies: 1 }, translations: [],
      },
      {
        id: 'c2', postId: 'post-1', authorId: 'u2', parentId: 'c1',
        replyToUserId: 'u1', bodyVersion: 1, sourceText: 'Gone too', sourceLanguage: 'ko',
        likeCount: 0, isDeleted: true, createdAt: new Date(), updatedAt: new Date(),
        author: { id: 'u2', handle: 'h2', name: 'd2', image: null },
        replyToUser: null, _count: { replies: 0 }, translations: [],
      },
      {
        id: 'c3', postId: 'post-1', authorId: 'u3', parentId: null,
        replyToUserId: null, bodyVersion: 1, sourceText: 'Alive', sourceLanguage: 'en',
        likeCount: 0, isDeleted: null, createdAt: new Date(), updatedAt: new Date(),
        author: { id: 'u3', handle: 'h3', name: 'd3', image: null },
        replyToUser: null, _count: { replies: 0 }, translations: [],
      },
    ])

    const res = await GET(makeRequest(), makeCtx('post-1'))
    const body = await res.json()

    expect(body.comments.map((c: { id: string }) => c.id)).toEqual(['c3'])
  })

  it('counts only live replies in replyCount', async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: 'viewer' } })
    mockPostFindFirst.mockResolvedValue({ id: 'post-1', commentCount: 1 })
    mockCommentLikeFindMany.mockResolvedValue([])
    // _count.replies is 2 in the DB, but one reply is deleted. Reporting 2
    // would advertise a reply the client never receives.
    mockCommentFindMany.mockResolvedValue([
      {
        id: 'c1', postId: 'post-1', authorId: 'u1', parentId: null,
        replyToUserId: null, bodyVersion: 1, sourceText: 'Parent', sourceLanguage: 'en',
        likeCount: 0, isDeleted: null, createdAt: new Date(), updatedAt: new Date(),
        author: { id: 'u1', handle: 'h1', name: 'd1', image: null },
        replyToUser: null, _count: { replies: 2 }, translations: [],
      },
      {
        id: 'c2', postId: 'post-1', authorId: 'u2', parentId: 'c1',
        replyToUserId: null, bodyVersion: 1, sourceText: 'Live', sourceLanguage: 'en',
        likeCount: 0, isDeleted: null, createdAt: new Date(), updatedAt: new Date(),
        author: { id: 'u2', handle: 'h2', name: 'd2', image: null },
        replyToUser: null, _count: { replies: 0 }, translations: [],
      },
      {
        id: 'c3', postId: 'post-1', authorId: 'u3', parentId: 'c1',
        replyToUserId: null, bodyVersion: 1, sourceText: 'Deleted', sourceLanguage: 'en',
        likeCount: 0, isDeleted: true, createdAt: new Date(), updatedAt: new Date(),
        author: { id: 'u3', handle: 'h3', name: 'd3', image: null },
        replyToUser: null, _count: { replies: 0 }, translations: [],
      },
    ])

    const res = await GET(makeRequest(), makeCtx('post-1'))
    const body = await res.json()

    expect(body.comments[0].replyCount).toBe(1)
    expect(body.comments[0].replies.map((r: { id: string }) => r.id)).toEqual(['c2'])
  })

  it('resolves translation display fields against the viewer display language', async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: 'viewer' } })
    mockPostFindFirst.mockResolvedValue({ id: 'post-1', commentCount: 3 })
    mockUserFindUnique.mockResolvedValue({ defaultDisplayLanguage: 'ko' })
    mockCommentFindMany.mockResolvedValue([
      // same language as display -> same_language, displayText = source
      {
        id: 'a', postId: 'post-1', authorId: 'u1', parentId: null, replyToUserId: null,
        bodyVersion: 1, sourceText: '안녕', sourceLanguage: 'ko', likeCount: 0,
        isDeleted: null, createdAt: new Date(), updatedAt: new Date(),
        author: { id: 'u1', handle: 'h1', name: 'd1', image: null },
        replyToUser: null, _count: { replies: 0 }, translations: [],
      },
      // en source, ready ko translation for current version -> ready
      {
        id: 'b', postId: 'post-1', authorId: 'u2', parentId: null, replyToUserId: null,
        bodyVersion: 2, sourceText: 'Hello', sourceLanguage: 'en', likeCount: 0,
        isDeleted: null, createdAt: new Date(), updatedAt: new Date(),
        author: { id: 'u2', handle: 'h2', name: 'd2', image: null },
        replyToUser: null, _count: { replies: 0 },
        translations: [{ language: 'ko', bodyVersion: 2, text: '안녕하세요' }],
      },
      // en source, no ko translation -> none, displayText = source
      {
        id: 'c', postId: 'post-1', authorId: 'u3', parentId: null, replyToUserId: null,
        bodyVersion: 1, sourceText: 'Bonjour', sourceLanguage: 'fr', likeCount: 0,
        isDeleted: null, createdAt: new Date(), updatedAt: new Date(),
        author: { id: 'u3', handle: 'h3', name: 'd3', image: null },
        replyToUser: null, _count: { replies: 0 }, translations: [],
      },
    ])

    const res = await GET(makeRequest(), makeCtx('post-1'))
    const body = await res.json()
    const byId = Object.fromEntries(body.comments.map((c: { id: string }) => [c.id, c]))

    expect(byId.a.translationState).toBe('same_language')
    expect(byId.a.displayText).toBe('안녕')
    expect(byId.a.edited).toBe(false)

    expect(byId.b.translationState).toBe('ready')
    expect(byId.b.displayText).toBe('안녕하세요')
    expect(byId.b.displayLanguage).toBe('ko')
    expect(byId.b.edited).toBe(true) // bodyVersion > 1

    expect(byId.c.translationState).toBe('none')
    expect(byId.c.displayText).toBe('Bonjour')
  })
})

describe('POST /api/posts/{postId}/comments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } })
    mockPostFindFirst.mockResolvedValue({ id: 'post-1' })
    mockResolveDefaultPostTranslationLanguages.mockReturnValue(['en', 'ja', 'ko'])
    mockDetectSourceLanguage.mockResolvedValue('en')
    mockTranslateCommentBodySettled.mockResolvedValue([
      { language: 'ja', status: 'ready', text: 'いいね' },
      { language: 'ko', status: 'ready', text: '좋아요' },
    ])
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

  it('creates comment successfully with server-detected language + settled translations', async () => {
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
    // Server detection is authoritative and passed to createComment.
    expect(mockDetectSourceLanguage).toHaveBeenCalledWith({ text: 'Nice post!', clientHint: 'en' })
    expect(mockCreateComment).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceLanguage: 'en',
        translationRows: [
          { language: 'ja', status: 'ready', text: 'いいね' },
          { language: 'ko', status: 'ready', text: '좋아요' },
        ],
      }),
    )
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

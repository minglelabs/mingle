import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
  mockGetServerSession,
  mockPostFindFirst,
  mockPostUpdate,
  mockUserFindUnique,
  mockDetectSourceLanguage,
  mockTranslatePostBodySettled,
  mockResolveEditTargetLanguages,
  mockPostLikeFindMany,
  mockUserFollowFindMany,
  mockPostTranslationFindMany,
  mockPostTranslationDeleteMany,
  mockPostTranslationCreateMany,
  mockTransaction,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockPostFindFirst: vi.fn(),
  mockPostUpdate: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockDetectSourceLanguage: vi.fn(),
  mockTranslatePostBodySettled: vi.fn(),
  mockResolveEditTargetLanguages: vi.fn(),
  mockPostLikeFindMany: vi.fn(),
  mockUserFollowFindMany: vi.fn(),
  mockPostTranslationFindMany: vi.fn(),
  mockPostTranslationDeleteMany: vi.fn(),
  mockPostTranslationCreateMany: vi.fn(),
  mockTransaction: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession: mockGetServerSession }))
vi.mock('@/lib/auth-options', () => ({ getAuthOptions: () => ({}) }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: mockTransaction,
    post: { findFirst: mockPostFindFirst, update: mockPostUpdate },
    user: { findUnique: mockUserFindUnique },
    postLike: { findMany: mockPostLikeFindMany },
    userFollow: { findMany: mockUserFollowFindMany },
    postTranslation: {
      findMany: mockPostTranslationFindMany,
      deleteMany: mockPostTranslationDeleteMany,
      createMany: mockPostTranslationCreateMany,
    },
  },
}))
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return { ...actual, after: (fn: () => Promise<void>) => { fn().catch(() => {}) } }
})
vi.mock('@/server/translation/detect-source-language', () => ({
  detectSourceLanguage: mockDetectSourceLanguage,
}))
vi.mock('@/server/translation/post-translation-service', () => ({
  translatePostBodySettled: mockTranslatePostBodySettled,
  resolveEditTargetLanguages: mockResolveEditTargetLanguages,
}))
vi.mock('@/server/posts/post-translation-repository', () => ({
  prismaTranslationDeps: {},
}))

// Make $transaction run the callback with a tx that reuses the same mocks.
function setupTransaction() {
  mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      post: { update: mockPostUpdate },
      postTranslation: {
        deleteMany: mockPostTranslationDeleteMany,
        createMany: mockPostTranslationCreateMany,
      },
    }
    return cb(tx)
  })
}

// Posting writes are gated on the moderation restriction; unrestricted here.
const { mockAccountRestrictionGuard } = vi.hoisted(() => ({
  mockAccountRestrictionGuard: vi.fn<(userId: string) => Promise<Response | null>>(async () => null),
}))
vi.mock('@/server/reports/account-restriction', () => ({
  accountRestrictionGuard: mockAccountRestrictionGuard,
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
    mockDetectSourceLanguage.mockResolvedValue('en')
    mockPostTranslationFindMany.mockResolvedValue([])
    mockResolveEditTargetLanguages.mockReturnValue(['zh-CN', 'ja', 'ko'])
    mockTranslatePostBodySettled.mockResolvedValue([
      { language: 'zh-CN', status: 'ready', text: '已更新' },
      { language: 'ja', status: 'ready', text: '更新済み' },
      { language: 'ko', status: 'ready', text: '수정됨' },
    ])
    mockPostTranslationDeleteMany.mockResolvedValue({ count: 0 })
    mockPostTranslationCreateMany.mockResolvedValue({ count: 3 })
    setupTransaction()
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

  it('increments bodyVersion on text change and swaps translations atomically', async () => {
    mockPostFindFirst.mockResolvedValue({
      id: 'p1', authorId: 'user-1', bodyVersion: 1, imageObjectKey: null, sourceText: 'old',
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
    // Detection ran and the new-version translations were written under v2.
    expect(mockDetectSourceLanguage).toHaveBeenCalledWith({ text: 'updated', clientHint: null })
    expect(mockPostTranslationCreateMany).toHaveBeenCalledWith({
      data: [
        { postId: 'p1', bodyVersion: 2, language: 'zh-CN', status: 'ready', text: '已更新' },
        { postId: 'p1', bodyVersion: 2, language: 'ja', status: 'ready', text: '更新済み' },
        { postId: 'p1', bodyVersion: 2, language: 'ko', status: 'ready', text: '수정됨' },
      ],
    })
  })

  it('does NOT re-translate an image-only edit (no body change)', async () => {
    mockPostFindFirst.mockResolvedValue({
      id: 'p1', authorId: 'user-1', bodyVersion: 3, imageObjectKey: 'img/old', sourceText: 'keep',
    })
    mockPostUpdate.mockResolvedValue({
      id: 'p1', bodyVersion: 3, backgroundKey: 'solid-white', updatedAt: new Date(),
    })

    const req = new NextRequest('http://localhost/api/posts/p1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageObjectKey: 'img/new' }),
    })
    const res = await PATCH(req, makeParams('p1'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.bodyVersion).toBe(3) // unchanged
    expect(mockDetectSourceLanguage).not.toHaveBeenCalled()
    expect(mockTranslatePostBodySettled).not.toHaveBeenCalled()
    expect(mockPostTranslationCreateMany).not.toHaveBeenCalled()
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

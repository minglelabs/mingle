import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
  mockGetServerSession,
  mockPostFindFirst,
  mockPostUpdate,
  mockPostUpdateMany,
  mockPostFindUnique,
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
  mockPostUpdateMany: vi.fn(),
  mockPostFindUnique: vi.fn(),
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
    post: {
      findFirst: mockPostFindFirst,
      update: mockPostUpdate,
      updateMany: mockPostUpdateMany,
      findUnique: mockPostFindUnique,
    },
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
const { mockRateLimitGuard } = vi.hoisted(() => ({
  mockRateLimitGuard: vi.fn<(action: string, userId: string) => Response | null>(() => null),
}))
vi.mock('@/server/rate-limit/rate-limit', () => ({ rateLimitGuard: mockRateLimitGuard }))

// Make $transaction run the callback with a tx that reuses the same mocks.
function setupTransaction() {
  mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      post: { update: mockPostUpdate, updateMany: mockPostUpdateMany, findUnique: mockPostFindUnique },
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
    mockPostUpdateMany.mockResolvedValue({ count: 1 })
    mockPostFindUnique.mockResolvedValue({
      id: 'p1', bodyVersion: 1, backgroundKey: 'warm-cream', updatedAt: new Date(),
    })
    mockRateLimitGuard.mockReturnValue(null)
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
    mockPostFindUnique.mockResolvedValue({
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
    mockPostFindUnique.mockResolvedValue({
      id: 'p1', bodyVersion: 3, backgroundKey: 'solid-white', updatedAt: new Date(),
    })

    const req = new NextRequest('http://localhost/api/posts/p1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageObjectKey: 'post-images/user-1/0f8fad5b-d9cb-469f-a165-70867728950e.jpg' }),
    })
    const res = await PATCH(req, makeParams('p1'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.bodyVersion).toBe(3) // unchanged
    expect(mockDetectSourceLanguage).not.toHaveBeenCalled()
    expect(mockTranslatePostBodySettled).not.toHaveBeenCalled()
    expect(mockPostTranslationCreateMany).not.toHaveBeenCalled()
  })

  it('rejects a foreign (conversation) image key without updating the post', async () => {
    mockPostFindFirst.mockResolvedValue({
      id: 'p1', authorId: 'user-1', bodyVersion: 3, imageObjectKey: null, sourceText: 'keep',
    })
    const req = new NextRequest('http://localhost/api/posts/p1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageObjectKey: 'conversation-images/conv-1/secret.jpg' }),
    })
    const res = await PATCH(req, makeParams('p1'))
    expect(res.status).toBe(400)
    expect(mockPostUpdateMany).not.toHaveBeenCalled()
  })
  const patchRequest = (body: unknown) => new NextRequest('http://localhost/api/posts/p1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const ownPost = (overrides: Record<string, unknown> = {}) => ({
    id: 'p1', authorId: 'user-1', bodyVersion: 2, imageObjectKey: null, sourceText: 'old',
    sourceLanguage: 'en', backgroundKey: 'warm-cream', updatedAt: new Date(), ...overrides,
  })

  it('is rate limited under update_post', async () => {
    mockRateLimitGuard.mockReturnValueOnce(new Response(JSON.stringify({ error: 'rate_limited' }), { status: 429 }))
    const res = await PATCH(patchRequest({ sourceText: 'x' }), makeParams('p1'))
    expect(res.status).toBe(429)
    expect(mockRateLimitGuard).toHaveBeenCalledWith('update_post', 'user-1')
    expect(mockPostFindFirst).not.toHaveBeenCalled()
  })

  it('updates only the version it read and answers 409 conflict when another edit won', async () => {
    mockPostFindFirst.mockResolvedValue(ownPost())
    mockPostUpdateMany.mockResolvedValue({ count: 0 })
    const res = await PATCH(patchRequest({ sourceText: 'new body' }), makeParams('p1'))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('conflict')
    expect(mockPostUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'p1', bodyVersion: 2 },
      data: expect.objectContaining({ bodyVersion: 3, sourceText: 'new body' }),
    }))
    // The losing edit's translations are never written.
    expect(mockPostTranslationCreateMany).not.toHaveBeenCalled()
  })

  it('answers 409 when the client edited a stale bodyVersion', async () => {
    mockPostFindFirst.mockResolvedValue(ownPost({ bodyVersion: 4 }))
    const res = await PATCH(patchRequest({ sourceText: 'x', bodyVersion: 3 }), makeParams('p1'))
    expect(res.status).toBe(409)
    expect(mockDetectSourceLanguage).not.toHaveBeenCalled()
    expect(mockPostUpdateMany).not.toHaveBeenCalled()
  })

  it.each([
    ['whitespace text + image removed', { sourceText: '  ', imageObjectKey: null }, { imageObjectKey: 'post-images/user-1/0f8fad5b-d9cb-469f-a165-70867728950e.jpg' }],
    ['null text + image removed', { sourceText: null, imageObjectKey: null }, { imageObjectKey: 'post-images/user-1/0f8fad5b-d9cb-469f-a165-70867728950e.jpg' }],
    ['removing the only image of an image-only post', { imageObjectKey: null }, { sourceText: null, imageObjectKey: 'post-images/user-1/0f8fad5b-d9cb-469f-a165-70867728950e.jpg' }],
    ['clearing the text of a text-only post', { sourceText: null }, {}],
  ])('rejects an edit that leaves no text and no image (%s)', async (_label, body, row) => {
    mockPostFindFirst.mockResolvedValue(ownPost(row))
    const res = await PATCH(patchRequest(body), makeParams('p1'))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('text_or_image_required')
    expect(mockPostUpdateMany).not.toHaveBeenCalled()
  })

  it('treats a save with nothing to change as a successful no-op', async () => {
    mockPostFindFirst.mockResolvedValue(ownPost({ sourceText: 'same' }))
    const res = await PATCH(patchRequest({ sourceText: 'same' }), makeParams('p1'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toMatchObject({ id: 'p1', bodyVersion: 2, unchanged: true })
    expect(mockPostUpdateMany).not.toHaveBeenCalled()
  })

  it('saves exactly the background key the author saw', async () => {
    mockPostFindFirst.mockResolvedValue(ownPost({ sourceText: 'same' }))
    const res = await PATCH(patchRequest({ sourceText: 'same', backgroundKey: 'dark-mesh' }), makeParams('p1'))
    expect(res.status).toBe(200)
    expect(mockPostUpdateMany).toHaveBeenCalledWith({
      where: { id: 'p1', bodyVersion: 2 },
      data: { backgroundKey: 'dark-mesh' },
    })
    expect(mockDetectSourceLanguage).not.toHaveBeenCalled()
  })

  it.each([
    ['an unknown key', 'not-a-preset'],
    ['the current background', 'warm-cream'],
    ['a non-string', 42],
  ])('rejects %s as the new background', async (_label, backgroundKey) => {
    mockPostFindFirst.mockResolvedValue(ownPost())
    const res = await PATCH(patchRequest({ backgroundKey }), makeParams('p1'))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid_background_key')
    expect(mockPostUpdateMany).not.toHaveBeenCalled()
  })

  it('legacy changeBackground never re-picks the current background', async () => {
    mockPostFindFirst.mockResolvedValue(ownPost({ sourceText: 'same' }))
    for (let i = 0; i < 20; i++) {
      await PATCH(patchRequest({ changeBackground: true }), makeParams('p1'))
    }
    for (const call of mockPostUpdateMany.mock.calls) {
      expect(call[0].data.backgroundKey).not.toBe('warm-cream')
    }
  })
})

describe('GET /api/posts/[postId] — author access', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUserFindUnique.mockResolvedValue({ defaultDisplayLanguage: 'en' })
    mockPostLikeFindMany.mockResolvedValue([])
    mockUserFollowFindMany.mockResolvedValue([])
    mockPostTranslationFindMany.mockResolvedValue([])
  })

  it('lets the author read their own archived or trashed post, and nobody else', async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: 'u1' } })
    mockPostFindFirst.mockResolvedValue({
      id: 'p1', authorId: 'u1', bodyVersion: 1, sourceText: 'mine', sourceLanguage: 'en',
      backgroundKey: 'warm-cream', imageObjectKey: 'post-images/u1/k.jpg', imageWidth: 800, imageHeight: 600,
      visibility: 'archived', deletedAt: null, likeCount: 0, commentCount: 0,
      publishedAt: new Date('2026-01-01T00:00:00.000Z'),
      author: { id: 'u1', handle: 'alice', name: 'Alice', image: null },
    })
    const res = await GET(new NextRequest('http://localhost/api/posts/p1'), makeParams('p1'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.post.visibility).toBe('archived')
    expect(json.post.image).toMatchObject({ width: 800, height: 600 })
    const where = mockPostFindFirst.mock.calls[0][0].where
    expect(where.OR).toContainEqual({ id: 'p1', authorId: 'u1', moderationHiddenAt: null })
  })

  it('a signed-out reader gets only the public visibility rule', async () => {
    mockGetServerSession.mockResolvedValue(null)
    mockPostFindFirst.mockResolvedValue(null)
    await GET(new NextRequest('http://localhost/api/posts/p1'), makeParams('p1'))
    const where = mockPostFindFirst.mock.calls[0][0].where
    expect(where.OR).not.toContainEqual(expect.objectContaining({ authorId: expect.anything() }))
    expect(where.visibility).toBe('public')
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

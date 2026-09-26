import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
  mockGetServerSession,
  mockPostCreate,
  mockPostFindFirst,
  mockTransaction,
  mockPostTranslationCreateMany,
  mockDetectSourceLanguage,
  mockTranslatePostBodySettled,
  mockResolveDefaultPostTranslationLanguages,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockPostCreate: vi.fn(),
  mockPostFindFirst: vi.fn(),
  mockTransaction: vi.fn(),
  mockPostTranslationCreateMany: vi.fn(),
  mockDetectSourceLanguage: vi.fn(),
  mockTranslatePostBodySettled: vi.fn(),
  mockResolveDefaultPostTranslationLanguages: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession: mockGetServerSession }))
vi.mock('@/lib/auth-options', () => ({ getAuthOptions: () => ({}) }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: mockTransaction,
    post: { create: mockPostCreate, findFirst: mockPostFindFirst },
    postTranslation: { createMany: mockPostTranslationCreateMany },
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
  resolveDefaultPostTranslationLanguages: mockResolveDefaultPostTranslationLanguages,
}))
// The in-memory limiter is covered by its own tests; here it would cap the
// suite at 10 creates per user per minute.
vi.mock('@/server/rate-limit/rate-limit', () => ({ rateLimitGuard: () => null }))
vi.mock('@/server/posts/post-translation-repository', () => ({
  prismaTranslationDeps: {},
}))

// $transaction runs its callback with a tx whose post.create / translation
// writes reuse the same mocks the route asserts on.
function setupTransaction() {
  mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      post: { create: mockPostCreate },
      postTranslation: { createMany: mockPostTranslationCreateMany },
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

import { POST } from './route'

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/posts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } })
    mockPostFindFirst.mockResolvedValue(null)
    mockDetectSourceLanguage.mockResolvedValue('en')
    mockResolveDefaultPostTranslationLanguages.mockReturnValue(['zh-CN', 'ja', 'ko'])
    mockTranslatePostBodySettled.mockResolvedValue([
      { language: 'zh-CN', status: 'ready', text: '你好' },
      { language: 'ja', status: 'ready', text: 'こんにちは' },
      { language: 'ko', status: 'failed', text: null },
    ])
    setupTransaction()
  })

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)
    const res = await POST(makeRequest({ sourceText: 'hi' }))
    expect(res.status).toBe(401)
  })

  it('returns 403 account_restricted for a moderator-restricted account, creating nothing', async () => {
    mockAccountRestrictionGuard.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'account_restricted' }), { status: 403 }))
    const res = await POST(makeRequest({ sourceText: 'hi' }))
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('account_restricted')
    expect(mockAccountRestrictionGuard).toHaveBeenCalledWith('user-1')
    expect(mockPostCreate).not.toHaveBeenCalled()
  })

  it('returns 400 when no text and no image', async () => {
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('text_or_image_required')
  })

  it('returns 400 when text is whitespace only', async () => {
    const res = await POST(makeRequest({ sourceText: '   ' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when text exceeds 1000 chars', async () => {
    const res = await POST(makeRequest({ sourceText: 'a'.repeat(1001) }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('text_too_long')
  })

  it('detects language, settles translations, then creates post + translations atomically (201)', async () => {
    mockPostCreate.mockResolvedValue({
      id: 'post-1',
      backgroundKey: 'solid-white',
      publishedAt: new Date(),
    })

    const res = await POST(makeRequest({
      sourceText: 'Hello world',
      sourceLanguage: 'en',
    }))
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.postId).toBe('post-1')
    expect(mockDetectSourceLanguage).toHaveBeenCalledWith({ text: 'Hello world', clientHint: 'en' })
    // Created inside the transaction with the detected language.
    expect(mockPostCreate).toHaveBeenCalledOnce()
    expect(mockPostCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ sourceLanguage: 'en', bodyVersion: 1, visibility: 'public' }),
    })
    // Settled rows (ready AND failed) are written together with the post.
    expect(mockPostTranslationCreateMany).toHaveBeenCalledWith({
      data: [
        { postId: 'post-1', bodyVersion: 1, language: 'zh-CN', status: 'ready', text: '你好' },
        { postId: 'post-1', bodyVersion: 1, language: 'ja', status: 'ready', text: 'こんにちは' },
        { postId: 'post-1', bodyVersion: 1, language: 'ko', status: 'failed', text: null },
      ],
    })
  })

  it('publishes an undetectable (emoji-only) post untranslated', async () => {
    mockDetectSourceLanguage.mockResolvedValue(null)
    mockPostCreate.mockResolvedValue({
      id: 'post-emoji', backgroundKey: 'solid-white', publishedAt: new Date(),
    })

    const res = await POST(makeRequest({ sourceText: '🎉🎉🎉' }))
    expect(res.status).toBe(201)
    // Null source language stored; no translation attempted / written.
    expect(mockTranslatePostBodySettled).not.toHaveBeenCalled()
    expect(mockPostTranslationCreateMany).not.toHaveBeenCalled()
    expect(mockPostCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ sourceLanguage: null }),
    })
  })

  it('returns existing post for duplicate clientPostId', async () => {
    mockPostFindFirst.mockResolvedValue({ id: 'post-dup', backgroundKey: 'solid-white', publishedAt: new Date() })

    const res = await POST(makeRequest({
      sourceText: 'Hello',
      sourceLanguage: 'en',
      clientPostId: 'post-dup',
    }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.duplicate).toBe(true)
    expect(mockPostCreate).not.toHaveBeenCalled()
    // Idempotent: no translation work done on a duplicate.
    expect(mockDetectSourceLanguage).not.toHaveBeenCalled()
  })

  it('allows image-only posts without text (no translation, immediate publish)', async () => {
    mockPostCreate.mockResolvedValue({
      id: 'post-img',
      backgroundKey: 'solid-coral',
      publishedAt: new Date(),
    })

    const res = await POST(makeRequest({
      imageObjectKey: 'post-images/user-1/0f8fad5b-d9cb-469f-a165-70867728950e.jpg',
    }))
    expect(res.status).toBe(201)
    expect(mockPostCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ imageObjectKey: 'post-images/user-1/0f8fad5b-d9cb-469f-a165-70867728950e.jpg' }),
    }))
    expect(mockDetectSourceLanguage).not.toHaveBeenCalled()
    expect(mockPostTranslationCreateMany).not.toHaveBeenCalled()
  })

  it.each([
    ['a private conversation image', 'conversation-images/conv-1/0f8fad5b-d9cb-469f-a165-70867728950e.jpg'],
    ['another user\'s post image', 'post-images/user-2/0f8fad5b-d9cb-469f-a165-70867728950e.jpg'],
    ['an unscoped legacy key', 'post-images/0f8fad5b-d9cb-469f-a165-70867728950e.jpg'],
    ['a traversal attempt', 'post-images/user-1/../../conversation-images/x.jpg'],
  ])('rejects %s as the image key and creates nothing', async (_label, key) => {
    const res = await POST(makeRequest({ sourceText: 'hi', imageObjectKey: key }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid_image_key')
    expect(mockPostCreate).not.toHaveBeenCalled()
    expect(mockTransaction).not.toHaveBeenCalled()
  })
})

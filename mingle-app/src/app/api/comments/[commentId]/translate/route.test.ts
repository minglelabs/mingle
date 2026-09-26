import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
  mockGetServerSession,
  mockCommentFindFirst,
  mockCommentUpdate,
  mockTranslateCommentOnDemand,
  mockDetectSourceLanguage,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockCommentFindFirst: vi.fn(),
  mockCommentUpdate: vi.fn(),
  mockTranslateCommentOnDemand: vi.fn(),
  mockDetectSourceLanguage: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession: mockGetServerSession }))
vi.mock('@/lib/auth-options', () => ({ getAuthOptions: () => ({}) }))
vi.mock('@/lib/prisma', () => ({
  prisma: { postComment: { findFirst: mockCommentFindFirst, update: mockCommentUpdate } },
}))
vi.mock('@/server/posts/comment-visibility', () => ({
  visibleSingleCommentWhere: (commentId: string) => ({ id: commentId }),
}))
vi.mock('@/server/translation/post-translation-service', async () => {
  const { canonicalizeTranslationLanguageCode } = await import('@/lib/translation-languages')
  return { translateCommentOnDemand: mockTranslateCommentOnDemand, normalizeRequestedTranslationLanguage: canonicalizeTranslationLanguageCode }
})
vi.mock('@/server/translation/detect-source-language', () => ({
  detectSourceLanguage: mockDetectSourceLanguage,
}))
vi.mock('@/server/translation/on-demand-translation-deps', () => ({ onDemandTranslationDeps: {} }))

import { POST } from './route'
import { __resetRateLimitStore } from '@/server/rate-limit/rate-limit'

const makeCtx = (commentId: string) => ({ params: Promise.resolve({ commentId }) })
function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/comments/c1/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/comments/{commentId}/translate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __resetRateLimitStore()
    mockGetServerSession.mockResolvedValue({ user: { id: 'viewer-1' } })
    mockTranslateCommentOnDemand.mockResolvedValue('translated')
  })

  it('returns 401 when signed out', async () => {
    mockGetServerSession.mockResolvedValue(null)
    const res = await POST(makeReq({ language: 'ko' }), makeCtx('c1'))
    expect(res.status).toBe(401)
  })

  it('detects + persists a null source language, then translates (no no_source_language 400)', async () => {
    mockCommentFindFirst.mockResolvedValue({ id: 'c1', bodyVersion: 1, sourceText: 'Ciao mondo', sourceLanguage: null })
    mockDetectSourceLanguage.mockResolvedValue('it')

    const res = await POST(makeReq({ language: 'en' }), makeCtx('c1'))
    expect(res.status).toBe(200)
    expect(mockDetectSourceLanguage).toHaveBeenCalledWith({ text: 'Ciao mondo' })
    expect(mockCommentUpdate).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { sourceLanguage: 'it' } })
    expect(mockTranslateCommentOnDemand).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ sourceLanguage: 'it', language: 'en' }),
    )
  })

  it('returns 400 when the null-language comment text is undetectable', async () => {
    mockCommentFindFirst.mockResolvedValue({ id: 'c1', bodyVersion: 1, sourceText: '🎉', sourceLanguage: null })
    mockDetectSourceLanguage.mockResolvedValue(null)

    const res = await POST(makeReq({ language: 'en' }), makeCtx('c1'))
    expect(res.status).toBe(400)
    expect(mockCommentUpdate).not.toHaveBeenCalled()
    expect(mockTranslateCommentOnDemand).not.toHaveBeenCalled()
  })

  it('rejects an unsupported language with 400 before any lookup', async () => {
    const res = await POST(makeReq({ language: 'xx-nope' }), makeCtx('c1'))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('unsupported_language')
    expect(mockCommentFindFirst).not.toHaveBeenCalled()
  })

  it('canonicalizes zh-cn to zh-CN and returns the original too', async () => {
    mockCommentFindFirst.mockResolvedValue({ id: 'c1', bodyVersion: 3, sourceText: 'hi', sourceLanguage: 'en' })
    const res = await POST(makeReq({ language: 'zh-cn' }), makeCtx('c1'))
    expect(mockTranslateCommentOnDemand).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ language: 'zh-CN', bodyVersion: 3 }),
    )
    expect(await res.json()).toMatchObject({ language: 'zh-CN', text: 'translated', sourceText: 'hi', sourceLanguage: 'en' })
  })

  it('rate-limits with translate_comment', async () => {
    mockCommentFindFirst.mockResolvedValue({ id: 'c1', bodyVersion: 1, sourceText: 'hi', sourceLanguage: 'en' })
    for (let i = 0; i < 60; i++) {
      expect((await POST(makeReq({ language: 'ko' }), makeCtx('c1'))).status).toBe(200)
    }
    const res = await POST(makeReq({ language: 'ko' }), makeCtx('c1'))
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBeTruthy()
  })
})

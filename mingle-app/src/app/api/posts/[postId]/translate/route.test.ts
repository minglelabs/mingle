import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
  mockGetServerSession,
  mockPostFindFirst,
  mockPostUpdate,
  mockTranslatePostOnDemand,
  mockDetectSourceLanguage,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockPostFindFirst: vi.fn(),
  mockPostUpdate: vi.fn(),
  mockTranslatePostOnDemand: vi.fn(),
  mockDetectSourceLanguage: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession: mockGetServerSession }))
vi.mock('@/lib/auth-options', () => ({ getAuthOptions: () => ({}) }))
vi.mock('@/lib/prisma', () => ({
  prisma: { post: { findFirst: mockPostFindFirst, update: mockPostUpdate } },
}))
vi.mock('@/server/posts/post-visibility', () => ({
  visibleSinglePostWhere: (postId: string) => ({ id: postId }),
}))
vi.mock('@/server/translation/post-translation-service', async () => {
  const { canonicalizeTranslationLanguageCode } = await import('@/lib/translation-languages')
  return { translatePostOnDemand: mockTranslatePostOnDemand, normalizeRequestedTranslationLanguage: canonicalizeTranslationLanguageCode }
})
vi.mock('@/server/translation/detect-source-language', () => ({
  detectSourceLanguage: mockDetectSourceLanguage,
}))
vi.mock('@/server/translation/on-demand-translation-deps', () => ({ onDemandTranslationDeps: {} }))

import { POST } from './route'
import { __resetRateLimitStore } from '@/server/rate-limit/rate-limit'

const makeCtx = (postId: string) => ({ params: Promise.resolve({ postId }) })
function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/posts/p1/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/posts/{postId}/translate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __resetRateLimitStore()
    mockGetServerSession.mockResolvedValue({ user: { id: 'viewer-1' } })
    mockTranslatePostOnDemand.mockResolvedValue('translated')
  })

  it('returns 401 when signed out', async () => {
    mockGetServerSession.mockResolvedValue(null)
    const res = await POST(makeReq({ language: 'ko' }), makeCtx('p1'))
    expect(res.status).toBe(401)
  })

  it('returns 400 without a language', async () => {
    const res = await POST(makeReq({}), makeCtx('p1'))
    expect(res.status).toBe(400)
  })

  it('translates a post that already has a source language', async () => {
    mockPostFindFirst.mockResolvedValue({ sourceText: '안녕', sourceLanguage: 'ko', bodyVersion: 1 })
    const res = await POST(makeReq({ language: 'en' }), makeCtx('p1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('ready')
    expect(mockDetectSourceLanguage).not.toHaveBeenCalled()
    expect(mockPostUpdate).not.toHaveBeenCalled()
  })

  it('detects + persists a null source language, then translates (no 400)', async () => {
    mockPostFindFirst.mockResolvedValue({ sourceText: 'Hola mundo', sourceLanguage: null, bodyVersion: 1 })
    mockDetectSourceLanguage.mockResolvedValue('es')

    const res = await POST(makeReq({ language: 'en' }), makeCtx('p1'))
    expect(res.status).toBe(200)
    expect(mockDetectSourceLanguage).toHaveBeenCalledWith({ text: 'Hola mundo' })
    // Persisted the detected language back onto the row.
    expect(mockPostUpdate).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { sourceLanguage: 'es' } })
    // Translation used the detected language.
    expect(mockTranslatePostOnDemand).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ sourceLanguage: 'es', language: 'en' }),
    )
  })

  it('returns 400 when the null-language text is genuinely undetectable', async () => {
    mockPostFindFirst.mockResolvedValue({ sourceText: '🎉🎉', sourceLanguage: null, bodyVersion: 1 })
    mockDetectSourceLanguage.mockResolvedValue(null)

    const res = await POST(makeReq({ language: 'en' }), makeCtx('p1'))
    expect(res.status).toBe(400)
    expect(mockPostUpdate).not.toHaveBeenCalled()
    expect(mockTranslatePostOnDemand).not.toHaveBeenCalled()
  })

  it('rejects an unsupported language with 400 before any lookup or LLM call', async () => {
    const res = await POST(makeReq({ language: 'klingon' }), makeCtx('p1'))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('unsupported_language')
    expect(mockPostFindFirst).not.toHaveBeenCalled()
    expect(mockTranslatePostOnDemand).not.toHaveBeenCalled()
  })

  it('canonicalizes the language key (zh-cn → zh-CN) for lookup, storage and the response', async () => {
    mockPostFindFirst.mockResolvedValue({ sourceText: 'hello', sourceLanguage: 'en', bodyVersion: 2 })
    const res = await POST(makeReq({ language: 'zh-cn' }), makeCtx('p1'))
    expect(res.status).toBe(200)
    expect(mockTranslatePostOnDemand).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ language: 'zh-CN', bodyVersion: 2 }),
    )
    expect((await res.json()).language).toBe('zh-CN')
  })

  it('always returns the original alongside the translation', async () => {
    mockPostFindFirst.mockResolvedValue({ sourceText: '안녕', sourceLanguage: 'ko', bodyVersion: 1 })
    const body = await (await POST(makeReq({ language: 'en' }), makeCtx('p1'))).json()
    expect(body).toMatchObject({ text: 'translated', sourceText: '안녕', sourceLanguage: 'ko' })
  })

  it('returns the original without an LLM call when asked for the source language', async () => {
    mockPostFindFirst.mockResolvedValue({ sourceText: '안녕', sourceLanguage: 'ko', bodyVersion: 1 })
    const body = await (await POST(makeReq({ language: 'ko-KR' }), makeCtx('p1'))).json()
    expect(body).toMatchObject({ status: 'ready', text: '안녕', language: 'ko' })
    expect(mockTranslatePostOnDemand).not.toHaveBeenCalled()
  })

  it('rate-limits with translate_post (429 + Retry-After)', async () => {
    mockPostFindFirst.mockResolvedValue({ sourceText: '안녕', sourceLanguage: 'ko', bodyVersion: 1 })
    for (let i = 0; i < 60; i++) {
      expect((await POST(makeReq({ language: 'en' }), makeCtx('p1'))).status).toBe(200)
    }
    const res = await POST(makeReq({ language: 'en' }), makeCtx('p1'))
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBeTruthy()
    expect(mockTranslatePostOnDemand).toHaveBeenCalledTimes(60)
  })
})

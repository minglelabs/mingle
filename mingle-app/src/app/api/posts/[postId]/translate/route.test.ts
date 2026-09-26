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
vi.mock('@/server/translation/post-translation-service', () => ({
  translatePostOnDemand: mockTranslatePostOnDemand,
}))
vi.mock('@/server/translation/detect-source-language', () => ({
  detectSourceLanguage: mockDetectSourceLanguage,
}))
vi.mock('@/server/posts/post-translation-repository', () => ({ prismaTranslationDeps: {} }))

import { POST } from './route'

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
})

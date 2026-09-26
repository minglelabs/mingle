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
vi.mock('@/server/translation/post-translation-service', () => ({
  translateCommentOnDemand: mockTranslateCommentOnDemand,
}))
vi.mock('@/server/translation/detect-source-language', () => ({
  detectSourceLanguage: mockDetectSourceLanguage,
}))
vi.mock('@/server/posts/post-translation-repository', () => ({ prismaTranslationDeps: {} }))

import { POST } from './route'

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
})

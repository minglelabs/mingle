import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
  mockGetServerSession,
  mockUpdateComment,
  mockDeleteComment,
  mockTranslateCommentOnDemand,
  mockResolveDefaultPostTranslationLanguages,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockUpdateComment: vi.fn(),
  mockDeleteComment: vi.fn(),
  mockTranslateCommentOnDemand: vi.fn(),
  mockResolveDefaultPostTranslationLanguages: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession: mockGetServerSession }))
vi.mock('@/lib/auth-options', () => ({ getAuthOptions: () => ({}) }))
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return { ...actual, after: (fn: () => Promise<void>) => { fn().catch(() => {}) } }
})
vi.mock('@/server/posts/comment-service', () => ({
  updateComment: mockUpdateComment,
  deleteComment: mockDeleteComment,
}))
vi.mock('@/server/translation/post-translation-service', () => ({
  translateCommentOnDemand: mockTranslateCommentOnDemand,
  resolveDefaultPostTranslationLanguages: mockResolveDefaultPostTranslationLanguages,
}))
vi.mock('@/server/posts/post-translation-repository', () => ({
  prismaTranslationDeps: {},
}))

import { PATCH, DELETE } from './route'

function makeCtx(commentId: string) {
  return { params: Promise.resolve({ commentId }) }
}

function makePatchRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/comments/c1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('PATCH /api/comments/{commentId}', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } })
    mockResolveDefaultPostTranslationLanguages.mockReturnValue(['en', 'ja', 'ko'])
  })

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)
    const res = await PATCH(makePatchRequest({ sourceText: 'x' }), makeCtx('c1'))
    expect(res.status).toBe(401)
  })

  it('returns 400 when text is empty', async () => {
    const res = await PATCH(makePatchRequest({ sourceText: '' }), makeCtx('c1'))
    expect(res.status).toBe(400)
  })

  it('returns 403 when not author', async () => {
    mockUpdateComment.mockRejectedValue(new Error('forbidden'))
    const res = await PATCH(makePatchRequest({ sourceText: 'edit' }), makeCtx('c1'))
    expect(res.status).toBe(403)
  })

  it('updates and increments bodyVersion', async () => {
    mockUpdateComment.mockResolvedValue({
      id: 'c1',
      bodyVersion: 2,
      sourceText: 'edited',
      updatedAt: new Date(),
    })
    mockTranslateCommentOnDemand.mockResolvedValue('translated')

    const res = await PATCH(
      makePatchRequest({ sourceText: 'edited', sourceLanguage: 'en' }),
      makeCtx('c1'),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.bodyVersion).toBe(2)
  })
})

describe('DELETE /api/comments/{commentId}', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } })
  })

  it('returns 404 when comment not found', async () => {
    mockDeleteComment.mockRejectedValue(new Error('not_found'))
    const res = await DELETE(
      new NextRequest('http://localhost/api/comments/c1', { method: 'DELETE' }),
      makeCtx('c1'),
    )
    expect(res.status).toBe(404)
  })

  it('returns hadReplies=false when no replies', async () => {
    mockDeleteComment.mockResolvedValue({ deleted: true, commentId: 'c1', hadReplies: false })
    const res = await DELETE(
      new NextRequest('http://localhost/api/comments/c1', { method: 'DELETE' }),
      makeCtx('c1'),
    )
    const body = await res.json()
    expect(body.deleted).toBe(true)
    expect(body.hadReplies).toBe(false)
  })

  it('returns hadReplies=true when replies exist', async () => {
    mockDeleteComment.mockResolvedValue({ deleted: true, commentId: 'c1', hadReplies: true })
    const res = await DELETE(
      new NextRequest('http://localhost/api/comments/c1', { method: 'DELETE' }),
      makeCtx('c1'),
    )
    const body = await res.json()
    expect(body.deleted).toBe(true)
    expect(body.hadReplies).toBe(true)
  })

  it('returns 403 when not authorized', async () => {
    mockDeleteComment.mockRejectedValue(new Error('forbidden'))
    const res = await DELETE(
      new NextRequest('http://localhost/api/comments/c1', { method: 'DELETE' }),
      makeCtx('c1'),
    )
    expect(res.status).toBe(403)
  })
})

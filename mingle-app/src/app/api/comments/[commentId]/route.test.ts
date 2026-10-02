import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
  mockGetServerSession,
  mockUpdateComment,
  mockAuthorizeCommentEdit,
  mockDeleteComment,
  mockDetectSourceLanguage,
  mockTranslateCommentBodySettled,
  mockResolveEditTargetLanguages,
  mockCommentTranslationFindMany,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockUpdateComment: vi.fn(),
  mockAuthorizeCommentEdit: vi.fn(),
  mockDeleteComment: vi.fn(),
  mockDetectSourceLanguage: vi.fn(),
  mockTranslateCommentBodySettled: vi.fn(),
  mockResolveEditTargetLanguages: vi.fn(),
  mockCommentTranslationFindMany: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession: mockGetServerSession }))
vi.mock('@/lib/auth-options', () => ({ getAuthOptions: () => ({}) }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    postCommentTranslation: { findMany: mockCommentTranslationFindMany },
  },
}))
vi.mock('@/server/posts/comment-service', () => ({
  updateComment: mockUpdateComment,
  authorizeCommentEdit: mockAuthorizeCommentEdit,
  deleteComment: mockDeleteComment,
}))
vi.mock('@/server/translation/detect-source-language', () => ({
  detectSourceLanguage: mockDetectSourceLanguage,
}))
vi.mock('@/server/translation/post-translation-service', () => ({
  translateCommentBodySettled: mockTranslateCommentBodySettled,
  resolveEditTargetLanguages: mockResolveEditTargetLanguages,
}))
vi.mock('@/server/posts/post-translation-repository', () => ({
  prismaTranslationDeps: {},
}))

// Posting writes are gated on the moderation restriction; unrestricted here.
const { mockAccountRestrictionGuard } = vi.hoisted(() => ({
  mockAccountRestrictionGuard: vi.fn<(userId: string) => Promise<Response | null>>(async () => null),
}))
vi.mock('@/server/reports/account-restriction', () => ({
  accountRestrictionGuard: mockAccountRestrictionGuard,
}))

import { PATCH, DELETE } from './route'
import { __resetRateLimitStore } from '@/server/rate-limit/rate-limit'

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
    __resetRateLimitStore()
    mockAuthorizeCommentEdit.mockResolvedValue({ bodyVersion: 3 })
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } })
    mockDetectSourceLanguage.mockResolvedValue('en')
    mockCommentTranslationFindMany.mockResolvedValue([])
    mockResolveEditTargetLanguages.mockReturnValue(['ja', 'ko'])
    mockTranslateCommentBodySettled.mockResolvedValue([
      { language: 'ja', status: 'ready', text: '編集済み' },
      { language: 'ko', status: 'ready', text: '수정됨' },
    ])
  })

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)
    const res = await PATCH(makePatchRequest({ sourceText: 'x' }), makeCtx('c1'))
    expect(res.status).toBe(401)
  })

  it('returns 403 account_restricted for a restricted account', async () => {
    mockAccountRestrictionGuard.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'account_restricted' }), { status: 403 }))
    const res = await PATCH(makePatchRequest({ sourceText: 'edit' }), makeCtx('c1'))
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('account_restricted')
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

  it('checks permission before detecting or translating (no LLM for a non-author)', async () => {
    mockAuthorizeCommentEdit.mockRejectedValue(new Error('forbidden'))
    const res = await PATCH(makePatchRequest({ sourceText: 'hack' }), makeCtx('c1'))
    expect(res.status).toBe(403)
    expect(mockDetectSourceLanguage).not.toHaveBeenCalled()
    expect(mockTranslateCommentBodySettled).not.toHaveBeenCalled()
    expect(mockCommentTranslationFindMany).not.toHaveBeenCalled()
    expect(mockUpdateComment).not.toHaveBeenCalled()
  })

  it('returns 404 / 410 from the permission check without translating', async () => {
    mockAuthorizeCommentEdit.mockRejectedValueOnce(new Error('not_found'))
    expect((await PATCH(makePatchRequest({ sourceText: 'x' }), makeCtx('c1'))).status).toBe(404)
    mockAuthorizeCommentEdit.mockRejectedValueOnce(new Error('already_deleted'))
    expect((await PATCH(makePatchRequest({ sourceText: 'x' }), makeCtx('c1'))).status).toBe(410)
    expect(mockDetectSourceLanguage).not.toHaveBeenCalled()
  })

  it('passes the authorized bodyVersion as the lock and maps a lost race to 409 conflict', async () => {
    mockUpdateComment.mockRejectedValue(new Error('conflict'))
    const res = await PATCH(makePatchRequest({ sourceText: 'edit' }), makeCtx('c1'))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('conflict')
    expect(mockUpdateComment).toHaveBeenCalledWith(expect.objectContaining({ expectedBodyVersion: 3 }))
  })

  it('rate-limits edits with update_comment (429 before any work)', async () => {
    mockUpdateComment.mockResolvedValue({ id: 'c1', bodyVersion: 4, sourceText: 'e', updatedAt: new Date() })
    for (let i = 0; i < 30; i++) {
      expect((await PATCH(makePatchRequest({ sourceText: 'e' }), makeCtx('c1'))).status).toBe(200)
    }
    mockAuthorizeCommentEdit.mockClear()
    const res = await PATCH(makePatchRequest({ sourceText: 'e' }), makeCtx('c1'))
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBeTruthy()
    expect(mockAuthorizeCommentEdit).not.toHaveBeenCalled()
  })

  it('updates and increments bodyVersion, passing settled translations', async () => {
    mockUpdateComment.mockResolvedValue({
      id: 'c1',
      bodyVersion: 2,
      sourceText: 'edited',
      updatedAt: new Date(),
    })

    const res = await PATCH(
      makePatchRequest({ sourceText: 'edited', sourceLanguage: 'en' }),
      makeCtx('c1'),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.bodyVersion).toBe(2)
    expect(mockUpdateComment).toHaveBeenCalledWith(
      expect.objectContaining({
        commentId: 'c1',
        sourceLanguage: 'en',
        translationRows: [
          { language: 'ja', status: 'ready', text: '編集済み' },
          { language: 'ko', status: 'ready', text: '수정됨' },
        ],
      }),
    )
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

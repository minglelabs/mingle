import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockFindMany, mockCount, mockUpdateMany, mockAudit } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockCount: vi.fn(),
  mockUpdateMany: vi.fn(),
  mockAudit: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: { userNotification: { findMany: mockFindMany, count: mockCount, updateMany: mockUpdateMany } },
}))
vi.mock('@/server/admin/audit', () => ({ writeAdminAudit: mockAudit }))
vi.mock('@/server/operator-inbox/staff-translate', () => ({
  STAFF_TRANSLATION_LANGUAGE: 'ko',
  translateForStaff: vi.fn(async (requests: Array<{ messageId: string }>) => (
    Object.fromEntries(requests.map((request) => [request.messageId, '번역됨']))
  )),
}))

import {
  clipActivityText,
  countOperatorActivityUnread,
  listOperatorActivity,
  markOperatorActivityRead,
  normalizeActivityId,
  operatorActivityWhere,
  storedCommentKorean,
} from './activity'

const user = (id: string, name: string) => ({
  id, handle: id, name, image: null, imageCropScale: null, imageCropX: null, imageCropY: null, isOfficial: false, isOperator: false,
})

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'n1',
    type: 'comment',
    readAt: null,
    createdAt: new Date('2026-10-02T10:00:00.000Z'),
    postId: 'p1',
    commentId: 'c1',
    recipient: user('op_1', 'Mina'),
    actor: user('user_1', 'João'),
    post: { sourceText: 'Bom dia  a todos', isDeleted: false, moderationHiddenAt: null, archivedAt: null, visibility: 'public' },
    comment: {
      sourceText: 'Que legal!', sourceLanguage: 'pt', bodyVersion: 1, imageObjectKey: null,
      isDeleted: false, moderationHiddenAt: null, translations: [],
    },
    ...overrides,
  }
}

describe('operator activity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('accepts only plain ids', () => {
    expect(normalizeActivityId(' abc_1-2 ')).toBe('abc_1-2')
    expect(normalizeActivityId('a/b')).toBeNull()
    expect(normalizeActivityId(3)).toBeNull()
  })

  it('clips long text and collapses whitespace', () => {
    expect(clipActivityText('  a \n b  ')).toBe('a b')
    expect(clipActivityText('가나다라마', 3)).toBe('가나다…')
    expect(clipActivityText('   ')).toBeNull()
  })

  it('reads only notifications addressed to operators, from real users', () => {
    expect(operatorActivityWhere('op_1')).toMatchObject({
      recipient: { isOperator: true, isDeleted: false },
      actor: { isOperator: false },
      recipientId: 'op_1',
    })
    expect(operatorActivityWhere()).not.toHaveProperty('recipientId')
  })

  it('uses a Korean original or the ready translation of the current body', () => {
    expect(storedCommentKorean({ sourceText: '안녕', sourceLanguage: 'ko', bodyVersion: 1, translations: [] })).toBe('안녕')
    expect(storedCommentKorean({
      sourceText: 'Oi', sourceLanguage: 'pt', bodyVersion: 2,
      translations: [{ bodyVersion: 1, text: '옛 번역' }, { bodyVersion: 2, text: '안녕' }],
    })).toBe('안녕')
    expect(storedCommentKorean({ sourceText: 'Oi', sourceLanguage: 'pt', bodyVersion: 2, translations: [{ bodyVersion: 1, text: '옛 번역' }] })).toBeNull()
  })

  it('shapes rows, pages with a cursor and fills Korean on request', async () => {
    mockFindMany.mockResolvedValue([row(), row({ id: 'n2', type: 'follow', postId: null, commentId: null, post: null, comment: null, readAt: new Date() })])
    const result = await listOperatorActivity({ limit: 1, includeKorean: true })
    expect(result.nextCursor).toBe('n1')
    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({
      id: 'n1', type: 'comment', isRead: false, postExcerpt: 'Bom dia a todos', commentText: 'Que legal!', commentKoText: '번역됨',
      operator: { userId: 'op_1', name: 'Mina' }, actor: { userId: 'user_1' }, postUnavailable: false, commentUnavailable: false,
    })
  })

  it('withholds the text of a deleted post or comment', async () => {
    mockFindMany.mockResolvedValue([row({
      post: { sourceText: 'x', isDeleted: true, moderationHiddenAt: null, archivedAt: null, visibility: 'public' },
      comment: { sourceText: 'y', sourceLanguage: 'pt', bodyVersion: 1, imageObjectKey: null, isDeleted: true, moderationHiddenAt: null, translations: [] },
    })])
    const { items } = await listOperatorActivity()
    expect(items[0]).toMatchObject({ postUnavailable: true, postExcerpt: null, commentUnavailable: true, commentText: null })
  })

  it('counts unread rows only', async () => {
    mockCount.mockResolvedValue(4)
    expect(await countOperatorActivityUnread()).toBe(4)
    expect(mockCount.mock.calls[0][0].where).toMatchObject({ readAt: null, actor: { isOperator: false } })
  })

  it('marks read up to the snapshot and audits it', async () => {
    mockUpdateMany.mockResolvedValue({ count: 3 })
    const before = new Date(Date.now() - 60_000)
    expect(await markOperatorActivityRead(null, { operatorUserId: 'op_1', before })).toBe(3)
    expect(mockUpdateMany.mock.calls[0][0].where).toMatchObject({ recipientId: 'op_1', readAt: null, createdAt: { lte: before } })
    expect(mockAudit).toHaveBeenCalledWith(null, expect.objectContaining({ action: 'activity.mark_read', operatorUserId: 'op_1' }))
  })

  it('never marks beyond now and skips the audit when asked', async () => {
    mockUpdateMany.mockResolvedValue({ count: 1 })
    await markOperatorActivityRead(null, { before: new Date(Date.now() + 3_600_000), audit: false })
    expect(mockUpdateMany.mock.calls[0][0].where.createdAt.lte.getTime()).toBeLessThanOrEqual(Date.now())
    expect(mockAudit).not.toHaveBeenCalled()
  })
})

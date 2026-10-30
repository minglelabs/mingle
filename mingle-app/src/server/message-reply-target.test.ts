import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockFindFirst } = vi.hoisted(() => ({ mockFindFirst: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { appMessage: { findFirst: mockFindFirst } } }))
vi.mock('@/server/api/controllers/shared/message-reaction-controller', () => ({
  messageIdentity: (ids: string[]) => ({ OR: [{ clientMessageId: { in: ids } }] }),
}))

import { resolveVerifiedMessageReplyReference } from './message-reply-target'

describe('resolveVerifiedMessageReplyReference', () => {
  beforeEach(() => mockFindFirst.mockReset())

  it('rebuilds the quote from the stored target instead of trusting client text', async () => {
    mockFindFirst.mockResolvedValue({
      userId: 'alice', isDeleted: false, sourceLanguage: 'en', metadata: {}, user: { name: 'Alice' },
      contents: [
        { contentType: 'SOURCE', language: 'en', text: 'real text' },
        { contentType: 'TRANSLATION_FINAL', language: 'ko', text: '진짜' },
      ],
    })
    const reference = await resolveVerifiedMessageReplyReference({
      sessionKey: 'sess', raw: { id: 'm1', text: 'forged', speakerName: 'Bob' },
    })
    expect(reference).toEqual({ id: 'm1', text: 'real text', translations: { ko: '진짜' }, speakerName: 'Alice', speakerUserId: 'alice' })
    expect(mockFindFirst.mock.calls[0][0].where.sessionKey).toBe('sess')
  })

  it('drops a reply to a message outside the room', async () => {
    mockFindFirst.mockResolvedValue(null)
    expect(await resolveVerifiedMessageReplyReference({ sessionKey: 'sess', raw: { id: 'other' } })).toBeNull()
  })

  it('keeps only who was quoted when the target was unsent', async () => {
    mockFindFirst.mockResolvedValue({
      userId: 'alice', isDeleted: true, sourceLanguage: 'en', metadata: { recalledAtMs: 5 }, user: { name: 'Alice' }, contents: [],
    })
    expect(await resolveVerifiedMessageReplyReference({ sessionKey: 'sess', raw: { id: 'm1' } }))
      .toEqual({ id: 'm1', text: '', speakerName: 'Alice', speakerUserId: 'alice', recalled: true })
  })
})

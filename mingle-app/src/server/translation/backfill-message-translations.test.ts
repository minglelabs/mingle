import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  messageFindUnique: vi.fn(),
  userFindUnique: vi.fn(),
  txMessageFindUnique: vi.fn(),
  txContentCreateMany: vi.fn(),
  txMessageUpdate: vi.fn(),
  queryRaw: vi.fn(),
  translateTexts: vi.fn(),
  notify: vi.fn(),
  members: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    appMessage: { findUnique: m.messageFindUnique },
    user: { findUnique: m.userFindUnique },
    $transaction: async (fn: (tx: unknown) => unknown) => fn({
      $queryRaw: m.queryRaw,
      appMessage: { findUnique: m.txMessageFindUnique, update: m.txMessageUpdate },
      appMessageContent: { createMany: m.txContentCreateMany },
    }),
  },
}))
vi.mock('@/server/translation/translate-texts', () => ({ translateTexts: m.translateTexts }))
vi.mock('@/server/conversation-realtime', () => ({ notifyConversationMessage: m.notify }))
vi.mock('@/lib/app-conversations', () => ({ listChannelMemberUserIdsBySessionKey: m.members }))

import { backfillMessageTranslations, missingTranslationLanguages, needsTranslationBackfill } from './backfill-message-translations'

const TEXT = 'My name is Elijah and I ll be happy to help you with English practice'

function message(overrides: Record<string, unknown> = {}) {
  return {
    id: 'msg_1', userId: 'u_elijah', clientMessageId: 'u-1-3', isDeleted: false, sourceLanguage: 'unknown',
    metadata: { sourceLanguage: 'unknown', translationLanguages: [] },
    contents: [{ contentType: 'SOURCE', language: 'unknown', text: TEXT, isDeleted: false }],
    ...overrides,
  }
}

describe('needsTranslationBackfill / missingTranslationLanguages', () => {
  it('flags an unknown source or a missing requested language, never the source itself', () => {
    expect(needsTranslationBackfill({ targetLanguages: ['ru', 'en', 'ko', 'ja'], sourceLanguage: 'unknown', translations: {} })).toBe(true)
    expect(needsTranslationBackfill({ targetLanguages: ['ru', 'en', 'ko'], sourceLanguage: 'en', translations: { ru: 'a', ko: 'b' } })).toBe(false)
    expect(needsTranslationBackfill({ targetLanguages: ['ru', 'en', 'ko'], sourceLanguage: 'en', translations: { ru: 'a' } })).toBe(true)
    expect(missingTranslationLanguages({ targetLanguages: ['ru', 'en', 'ko'], sourceLanguage: 'en', stored: ['ru'] })).toEqual(['ko'])
  })
})

describe('backfillMessageTranslations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.userFindUnique.mockResolvedValue({ translationModel: null })
    m.txMessageFindUnique.mockResolvedValue({ isDeleted: false, metadata: { sourceLanguage: 'unknown', translationLanguages: [] } })
    m.txContentCreateMany.mockImplementation(async ({ data }: { data: unknown[] }) => ({ count: data.length }))
    m.members.mockResolvedValue(['u_elijah', 'op_1'])
  })

  it('detects the source, stores the missing translations, relabels the message and refreshes the room', async () => {
    m.messageFindUnique.mockResolvedValue(message())
    m.translateTexts.mockResolvedValue({
      translations: { ru: 'Меня зовут Элайджа', en: TEXT, ko: '제 이름은 엘리야예요', ja: '私の名前はエリヤです' },
      detectedSourceLanguage: 'en', provider: 'claude', model: 'claude-haiku-5-5',
    })
    const result = await backfillMessageTranslations({ messageId: 'msg_1', sessionKey: 'sess', targetLanguages: ['ru', 'en', 'ko', 'ja'] })
    expect(result).toEqual({ added: ['ru', 'ko', 'ja'], relabeled: 'en' })
    expect(m.translateTexts).toHaveBeenCalledWith(expect.objectContaining({ sourceLanguage: 'auto', redetectSourceLanguage: true, targetLanguages: ['ru', 'en', 'ko', 'ja'] }))
    const translationRows = m.txContentCreateMany.mock.calls[0][0] as { data: Array<{ language: string; contentType: string }>; skipDuplicates: boolean }
    expect(translationRows.skipDuplicates).toBe(true)
    expect(translationRows.data.map((row) => row.language)).toEqual(['ru', 'ko', 'ja'])
    expect(m.txContentCreateMany.mock.calls[1][0]).toMatchObject({ data: [{ contentType: 'SOURCE', language: 'en', text: TEXT }] })
    expect(m.txMessageUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ sourceLanguage: 'en' }) }))
    expect(m.notify).toHaveBeenCalledWith('sess', ['u_elijah', 'op_1'], undefined, { timeoutMs: 3000 })
  })

  it('does nothing when the app already stored every translation', async () => {
    m.messageFindUnique.mockResolvedValue(message({
      sourceLanguage: 'en',
      contents: [
        { contentType: 'SOURCE', language: 'en', text: TEXT, isDeleted: false },
        { contentType: 'TRANSLATION_FINAL', language: 'ru', text: 'x', isDeleted: false },
        { contentType: 'TRANSLATION_FINAL', language: 'ko', text: 'y', isDeleted: false },
      ],
    }))
    expect(await backfillMessageTranslations({ messageId: 'msg_1', sessionKey: 'sess', targetLanguages: ['ru', 'en', 'ko'] })).toBeNull()
    expect(m.translateTexts).not.toHaveBeenCalled()
  })

  it('leaves deleted, recalled and photo messages alone, and gives up quietly when translation fails', async () => {
    m.messageFindUnique.mockResolvedValue(message({ isDeleted: true }))
    expect(await backfillMessageTranslations({ messageId: 'msg_1', sessionKey: 'sess', targetLanguages: ['ru'] })).toBeNull()
    m.messageFindUnique.mockResolvedValue(message())
    m.translateTexts.mockRejectedValue(new Error('timeout'))
    expect(await backfillMessageTranslations({ messageId: 'msg_1', sessionKey: 'sess', targetLanguages: ['ru'] })).toBeNull()
    expect(m.txContentCreateMany).not.toHaveBeenCalled()
  })
})

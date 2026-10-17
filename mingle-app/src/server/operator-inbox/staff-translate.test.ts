import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockTranslateTexts,
  mockMessageFindMany,
  writeSpies,
} = vi.hoisted(() => ({
  mockTranslateTexts: vi.fn(),
  mockMessageFindMany: vi.fn(),
  writeSpies: {
    contentUpsert: vi.fn(),
    contentCreate: vi.fn(),
    contentCreateMany: vi.fn(),
    contentUpdate: vi.fn(),
    messageUpdate: vi.fn(),
    memberUpdate: vi.fn(),
    memberUpdateMany: vi.fn(),
  },
}))

vi.mock('@/server/translation/translate-texts', () => ({ translateTexts: mockTranslateTexts }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    appMessage: { findMany: mockMessageFindMany, update: writeSpies.messageUpdate },
    appMessageContent: {
      upsert: writeSpies.contentUpsert,
      create: writeSpies.contentCreate,
      createMany: writeSpies.contentCreateMany,
      update: writeSpies.contentUpdate,
    },
    appConversationChannelMember: { update: writeSpies.memberUpdate, updateMany: writeSpies.memberUpdateMany },
  },
}))

import {
  STAFF_TRANSLATION_CACHE_MAX_ENTRIES,
  clearStaffTranslationCache,
  staffTranslationCacheSize,
  translateForStaff,
  translateRoomMessagesForStaff,
} from '@/server/operator-inbox/staff-translate'

function row(id: string, text: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    sourceLanguage: 'pt',
    metadata: null,
    contents: [{ contentType: 'SOURCE', language: 'pt', text }],
    ...extra,
  }
}

function expectNoWrites() {
  for (const spy of Object.values(writeSpies)) expect(spy).not.toHaveBeenCalled()
}

describe('staff translation (admin-only Korean)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearStaffTranslationCache()
    mockTranslateTexts.mockImplementation(async ({ text, targetLanguages }: { text: string; targetLanguages: string[] }) => ({
      translations: Object.fromEntries(targetLanguages.map((language) => [language, `${language}:${text}`])),
      provider: 'gemini',
      model: 'test',
    }))
  })

  it('translates a room message into Korean only and never writes anything', async () => {
    mockMessageFindMany.mockResolvedValue([row('m1', 'Olá, tudo bem?')])
    const result = await translateRoomMessagesForStaff({ sessionKey: 'sess_1', messageIds: ['m1'] })
    expect(result).toEqual({ m1: 'ko:Olá, tudo bem?' })
    expect(mockTranslateTexts).toHaveBeenCalledWith(expect.objectContaining({ targetLanguages: ['ko'], sourceLanguage: 'pt' }))
    // Scoped to the room, read-only.
    expect(mockMessageFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: { in: ['m1'] }, sessionKey: 'sess_1' }),
    }))
    expectNoWrites()
  })

  it('reuses the in-memory translation for the same message + language (no second model call)', async () => {
    mockMessageFindMany.mockResolvedValue([row('m1', 'Olá')])
    await translateRoomMessagesForStaff({ sessionKey: 'sess_1', messageIds: ['m1'] })
    await translateRoomMessagesForStaff({ sessionKey: 'sess_1', messageIds: ['m1'] })
    expect(mockTranslateTexts).toHaveBeenCalledTimes(1)
    expectNoWrites()
  })

  it('re-translates when the stored source text changed', async () => {
    mockMessageFindMany.mockResolvedValueOnce([row('m1', 'Olá')]).mockResolvedValueOnce([row('m1', 'Oi')])
    await translateRoomMessagesForStaff({ sessionKey: 'sess_1', messageIds: ['m1'] })
    const second = await translateRoomMessagesForStaff({ sessionKey: 'sess_1', messageIds: ['m1'] })
    expect(second).toEqual({ m1: 'ko:Oi' })
    expect(mockTranslateTexts).toHaveBeenCalledTimes(2)
  })

  it('uses a stored Korean translation or a Korean original without a model call', async () => {
    mockMessageFindMany.mockResolvedValue([
      row('m1', 'Hello', { sourceLanguage: 'en', contents: [
        { contentType: 'SOURCE', language: 'en', text: 'Hello' },
        { contentType: 'TRANSLATION_FINAL', language: 'ko', text: '안녕하세요' },
      ] }),
      row('m2', '반가워요', { sourceLanguage: 'ko', contents: [{ contentType: 'SOURCE', language: 'ko', text: '반가워요' }] }),
    ])
    const result = await translateRoomMessagesForStaff({ sessionKey: 'sess_1', messageIds: ['m1', 'm2'] })
    expect(result).toEqual({ m1: '안녕하세요', m2: '반가워요' })
    expect(mockTranslateTexts).not.toHaveBeenCalled()
  })

  it('returns null for photos, unknown ids and provider failures, and never caches a failure', async () => {
    mockMessageFindMany.mockResolvedValue([
      row('photo', '📷 Photo', { metadata: { image: { objectKey: 'conversation-images/a.jpg' } } }),
      row('m1', 'Olá'),
    ])
    mockTranslateTexts.mockRejectedValueOnce(new Error('Provider rate-limited. Retry in 5s.'))
    const result = await translateRoomMessagesForStaff({ sessionKey: 'sess_1', messageIds: ['photo', 'm1', 'elsewhere'] })
    expect(result).toEqual({ photo: null, m1: null, elsewhere: null })
    expect(staffTranslationCacheSize()).toBe(0)
    const retry = await translateRoomMessagesForStaff({ sessionKey: 'sess_1', messageIds: ['m1'] })
    expect(retry).toEqual({ m1: 'ko:Olá' })
    expectNoWrites()
  })

  it('bounds the cache (least recently used entries go first)', async () => {
    const requests = Array.from({ length: STAFF_TRANSLATION_CACHE_MAX_ENTRIES + 5 }, (_, index) => ({
      messageId: `m${index}`,
      text: `t${index}`,
      sourceLanguage: 'en',
    }))
    await translateForStaff(requests)
    expect(staffTranslationCacheSize()).toBe(STAFF_TRANSLATION_CACHE_MAX_ENTRIES)
    mockTranslateTexts.mockClear()
    await translateForStaff([requests[0]])
    expect(mockTranslateTexts).toHaveBeenCalledTimes(1)
    await translateForStaff([requests.at(-1)!])
    expect(mockTranslateTexts).toHaveBeenCalledTimes(1)
  })

  it('shares one in-flight model call between concurrent requests for the same message', async () => {
    let release!: () => void
    mockTranslateTexts.mockImplementationOnce(() => new Promise((resolve) => {
      release = () => resolve({ translations: { ko: '안녕' }, provider: 'gemini', model: 'test' })
    }))
    const first = translateForStaff([{ messageId: 'm1', text: 'hi', sourceLanguage: 'en' }])
    const second = translateForStaff([{ messageId: 'm1', text: 'hi', sourceLanguage: 'en' }])
    await vi.waitFor(() => expect(mockTranslateTexts).toHaveBeenCalledTimes(1))
    release()
    await expect(first).resolves.toEqual({ m1: '안녕' })
    await expect(second).resolves.toEqual({ m1: '안녕' })
    expect(mockTranslateTexts).toHaveBeenCalledTimes(1)
  })
})

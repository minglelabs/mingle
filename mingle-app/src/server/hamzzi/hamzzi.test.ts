import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  userFindFirst: vi.fn(),
  messageFindMany: vi.fn(),
  messageFindFirst: vi.fn(),
  queryRaw: vi.fn(),
  ensureHamzzi: vi.fn(),
  send: vi.fn(),
  generateJson: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findFirst: mocks.userFindFirst },
    appMessage: { findMany: mocks.messageFindMany, findFirst: mocks.messageFindFirst },
    $queryRaw: mocks.queryRaw,
  },
}))
vi.mock('@/lib/hamzzi', () => ({ HAMZZI_USER_ID: 'hamzzi', ensureHamzziAccount: mocks.ensureHamzzi }))
vi.mock('@/server/operator-inbox/send', () => ({ sendOfficialAccountMessage: mocks.send }))
vi.mock('@/server/llm/generate-json', () => ({ generateJson: mocks.generateJson }))

import { generateHamzziReply, loadHamzziReplyContext, validateHamzziReply } from './reply'
import { __resetHamzziAttemptsForTests, hamzziRequestId, replyAsHamzzi, runHamzziAutoReplies } from './worker'

const hamzzi = { id: 'hamzzi', isActive: true }
const candidate = { conversationId: 'conv_1', sessionKey: 'sess', userId: 'user_1', messageId: 'msg_2', createdAt: new Date('2026-11-17T00:00:00Z') }

function message(userId: string, text: string, minute: number) {
  return { userId, createdAt: new Date(Date.UTC(2026, 10, 17, 0, minute)), sourceLanguage: 'ko', metadata: null, contents: [{ language: 'ko', text }] }
}

function context() {
  return {
    profile: { name: '도윤', primaryLanguages: ['ko'], interestLanguages: [{ language: 'en', level: 2 }] },
    nativeLanguage: 'ko',
    practiceLanguage: 'en',
    counterpartName: '도윤',
    transcript: [{ from: 'them' as const, at: '', text: '안녕' }],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  __resetHamzziAttemptsForTests()
  mocks.ensureHamzzi.mockResolvedValue(hamzzi)
  mocks.userFindFirst.mockResolvedValue({
    name: '도윤', handle: 'doyun', primaryLanguages: ['ko'], interestLanguages: ['en'], interestLanguageLevels: [2],
    defaultDisplayLanguage: 'ko', defaultConversationLanguages: ['ko', 'en'],
  })
  // Newest first, as the query returns them.
  mocks.messageFindMany.mockResolvedValue([message('user_1', '나 떡볶이 먹었어', 2), message('hamzzi', 'Hi!', 1)])
  mocks.messageFindFirst.mockResolvedValue({ id: 'msg_2' })
  mocks.generateJson.mockResolvedValue({ kind: 'chat', replyLanguage: 'en', reply: 'Yum! Was it spicy?' })
  mocks.send.mockResolvedValue({ duplicate: false, messageId: 'reply_1' })
})

describe('hamzzi reply context', () => {
  it('chats in the first interest language and answers app questions in the primary language', async () => {
    const loaded = await loadHamzziReplyContext({ sessionKey: 'sess', userId: 'user_1' })
    expect(loaded).toMatchObject({
      nativeLanguage: 'ko',
      practiceLanguage: 'en',
      profile: { interestLanguages: [{ language: 'en', level: 2 }] },
      transcript: [{ from: 'me', text: 'Hi!' }, { from: 'them', text: '나 떡볶이 먹었어' }],
    })
  })

  it('practices the native language when the user picked no interest language', async () => {
    mocks.userFindFirst.mockResolvedValue({
      name: null, handle: 'x', primaryLanguages: ['ja'], interestLanguages: [], interestLanguageLevels: [],
      defaultDisplayLanguage: null, defaultConversationLanguages: [],
    })
    await expect(loadHamzziReplyContext({ sessionKey: 'sess', userId: 'user_1' })).resolves.toMatchObject({
      nativeLanguage: 'ja', practiceLanguage: 'ja',
    })
  })

  it('has nothing to answer when only Hamzzi has written', async () => {
    mocks.messageFindMany.mockResolvedValue([message('hamzzi', 'Welcome!', 1)])
    await expect(loadHamzziReplyContext({ sessionKey: 'sess', userId: 'user_1' })).resolves.toBeNull()
  })
})

describe('hamzzi reply generation', () => {
  it('validates the model answer', () => {
    expect(validateHamzziReply({ kind: 'app_help', replyLanguage: 'ko', reply: ' 해씨는… ' })).toEqual({ kind: 'app_help', replyLanguage: 'ko', reply: '해씨는…' })
    expect(validateHamzziReply({ kind: 'weird', reply: 'hi' })).toEqual({ kind: 'chat', replyLanguage: '', reply: 'hi' })
    expect(() => validateHamzziReply({ kind: 'chat' })).toThrow()
    expect(() => validateHamzziReply({ reply: 'x'.repeat(801) })).toThrow('reply_too_long')
  })

  it('falls back to the language the kind calls for when the model names none', async () => {
    const generate = vi.fn().mockResolvedValue({ kind: 'app_help', replyLanguage: '??', reply: '설명' })
    await expect(generateHamzziReply(context(), { generate })).resolves.toEqual({ kind: 'app_help', language: 'ko', text: '설명' })
    generate.mockResolvedValue({ kind: 'chat', replyLanguage: '', reply: 'Hi' })
    await expect(generateHamzziReply(context(), { generate })).resolves.toEqual({ kind: 'chat', language: 'en', text: 'Hi' })
  })
})

describe('hamzzi worker', () => {
  it('sends the reply as Hamzzi in the language it was written in, once per message', async () => {
    await expect(replyAsHamzzi(candidate)).resolves.toBe('sent')
    expect(mocks.send).toHaveBeenCalledWith({
      sender: hamzzi,
      sourceLanguage: 'en',
      operatorUserId: 'hamzzi',
      conversationId: 'conv_1',
      text: 'Yum! Was it spicy?',
      clientRequestId: hamzziRequestId('msg_2'),
    })
    await expect(replyAsHamzzi(candidate)).resolves.toBe('skipped')
    expect(mocks.send).toHaveBeenCalledTimes(1)
    expect(mocks.generateJson).toHaveBeenCalledWith(expect.objectContaining({ model: 'gemini-3.5-flash-lite', provider: 'direct' }))
  })

  it('leaves a message alone when the model declines', async () => {
    mocks.generateJson.mockResolvedValue({ kind: 'chat', replyLanguage: 'en', reply: '' })
    await expect(replyAsHamzzi(candidate)).resolves.toBe('declined')
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it('does not answer a message that is no longer the latest', async () => {
    mocks.messageFindFirst.mockResolvedValue({ id: 'msg_3' })
    await expect(replyAsHamzzi(candidate)).resolves.toBe('skipped')
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it('does nothing while Hamzzi is turned off', async () => {
    mocks.ensureHamzzi.mockResolvedValue(null)
    await expect(replyAsHamzzi(candidate)).resolves.toBe('skipped')
    expect(mocks.generateJson).not.toHaveBeenCalled()
  })

  it('gives up after three failures', async () => {
    mocks.generateJson.mockRejectedValue(Object.assign(new Error('x'), { code: 'llm_timeout' }))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    for (let i = 0; i < 3; i += 1) await expect(replyAsHamzzi(candidate)).resolves.toBe('failed')
    await expect(replyAsHamzzi(candidate)).resolves.toBe('skipped')
    warn.mockRestore()
  })

  it('answers every candidate of a run', async () => {
    mocks.queryRaw.mockResolvedValue([candidate, { ...candidate, conversationId: 'conv_2', sessionKey: 'sess2', messageId: 'msg_9' }])
    mocks.messageFindFirst.mockImplementation(async ({ where }: { where: { sessionKey: string } }) => ({ id: where.sessionKey === 'sess' ? 'msg_2' : 'msg_9' }))
    await expect(runHamzziAutoReplies()).resolves.toEqual({ candidates: 2, sent: 2, declined: 0, skipped: 0, failed: 0 })
  })

  it('is off with HAMZZI_AUTO_REPLY=off', async () => {
    vi.stubEnv('HAMZZI_AUTO_REPLY', 'off')
    await expect(runHamzziAutoReplies()).resolves.toMatchObject({ candidates: 0 })
    expect(mocks.queryRaw).not.toHaveBeenCalled()
    vi.unstubAllEnvs()
  })
})

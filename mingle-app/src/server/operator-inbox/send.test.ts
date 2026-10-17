import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  requireOperatorAccount: vi.fn(),
  channelFindFirst: vi.fn(),
  messageFindUnique: vi.fn(),
  txMessageCreate: vi.fn(),
  txContentCreateMany: vi.fn(),
  listMembers: vi.fn(),
  isBlocked: vi.fn(),
  materialize: vi.fn(),
  listMemberIds: vi.fn(),
  translateTexts: vi.fn(),
  writeAdminAudit: vi.fn(),
  notifyConversationMessage: vi.fn(),
  sendPush: vi.fn(),
  notifyInbox: vi.fn(),
  trackedEventLog: vi.fn(),
  trackedActivity: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    appConversationChannel: { findFirst: m.channelFindFirst },
    appMessage: { findUnique: m.messageFindUnique },
    $transaction: (run: (tx: unknown) => unknown) => run({
      appMessage: { create: m.txMessageCreate },
      appMessageContent: { createMany: m.txContentCreateMany },
    }),
  },
}))
vi.mock('@/server/operators/operator-guard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/operators/operator-guard')>()),
  requireOperatorAccount: m.requireOperatorAccount,
}))
vi.mock('@/lib/app-conversations', () => ({
  listConversationMembersForUser: m.listMembers,
  isMessageSenderBlockedInConversation: m.isBlocked,
  materializePendingConversationInvitees: m.materialize,
  listChannelMemberUserIdsBySessionKey: m.listMemberIds,
}))
vi.mock('@/server/translation/translate-texts', () => ({ translateTexts: m.translateTexts }))
vi.mock('@/server/admin/audit', () => ({ writeAdminAudit: m.writeAdminAudit }))
vi.mock('@/server/conversation-realtime', () => ({ notifyConversationMessage: m.notifyConversationMessage }))
vi.mock('@/server/push-notifications', () => ({ sendPushNotificationForConversationMessage: m.sendPush }))
vi.mock('@/server/operator-inbox/notify', () => ({ notifyOperatorInboxActivity: m.notifyInbox }))
// Never imported by the admin send path; mocked so a regression would show up as a call.
vi.mock('@/lib/app-analytics', () => ({ createTrackedEventLog: m.trackedEventLog, recordTrackedUserActivity: m.trackedActivity }))

import { OperatorAccountRequiredError } from '@/server/operators/operator-guard'
import { OperatorSendError, sendOperatorMessage } from '@/server/operator-inbox/send'

const ctx = { sessionId: 'adm_1', ip: '127.0.0.1', userAgent: 'test' }
const OPERATOR = {
  id: 'op_1',
  handle: 'mina.silva',
  name: 'Mina',
  image: 'https://img.example/mina.jpg',
  primaryLanguages: ['pt'],
  defaultConversationLanguages: ['pt', 'en'],
  defaultDisplayLanguage: 'pt',
  isActive: true,
}
const CREATED_AT = new Date('2026-09-30T10:00:00.000Z')

function member(userId: string, selectedLanguages: string[]) {
  return {
    userId,
    name: userId,
    handle: userId,
    image: null,
    imageCropScale: null,
    imageCropX: null,
    imageCropY: null,
    selectedLanguages,
    nationality: null,
    primaryLanguages: [],
    blocked: false,
  }
}

function send(overrides: Partial<{ text: string; clientRequestId: string | null; operatorUserId: string }> = {}) {
  return sendOperatorMessage(ctx, {
    operatorUserId: 'op_1',
    conversationId: 'conv_1',
    text: '안녕하세요, 반가워요',
    clientRequestId: 'req-00000001',
    ...overrides,
  })
}

async function expectSendError(promise: Promise<unknown>, code: string) {
  const error = await promise.then(() => null, (reason: unknown) => reason)
  expect(error).toBeInstanceOf(OperatorSendError)
  expect((error as OperatorSendError).code).toBe(code)
  return error as OperatorSendError
}

function contentRows() {
  return m.txContentCreateMany.mock.calls[0]?.[0]?.data as Array<{ contentType: string; language: string; text: string }>
}

describe('sendOperatorMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.requireOperatorAccount.mockResolvedValue(OPERATOR)
    m.channelFindFirst.mockResolvedValue({ id: 'conv_1', sessionKey: 'sess_1' })
    m.messageFindUnique.mockResolvedValue(null)
    m.listMembers.mockResolvedValue([member('op_1', ['pt', 'en']), member('user_1', ['ko', 'en'])])
    m.isBlocked.mockResolvedValue(false)
    m.materialize.mockResolvedValue(null)
    m.listMemberIds.mockResolvedValue(['op_1', 'user_1'])
    m.translateTexts.mockResolvedValue({
      translations: { pt: 'Olá, prazer!', en: 'Hi, nice to meet you!', ko: '안녕하세요, 반가워요' },
      detectedSourceLanguage: 'ko',
      provider: 'gemini',
      model: 'gemini-test',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    })
    m.txMessageCreate.mockResolvedValue({ id: 'msg_1', createdAt: CREATED_AT })
    m.txContentCreateMany.mockResolvedValue({ count: 3 })
    m.writeAdminAudit.mockResolvedValue(undefined)
    m.notifyConversationMessage.mockResolvedValue(undefined)
    m.sendPush.mockResolvedValue(undefined)
    m.notifyInbox.mockResolvedValue(undefined)
  })

  it('refuses a non-operator account before anything else', async () => {
    m.requireOperatorAccount.mockRejectedValue(new OperatorAccountRequiredError('user_9'))
    await expect(send({ operatorUserId: 'user_9' })).rejects.toBeInstanceOf(OperatorAccountRequiredError)
    expect(m.listMembers).not.toHaveBeenCalled()
    expect(m.translateTexts).not.toHaveBeenCalled()
    expect(m.txMessageCreate).not.toHaveBeenCalled()
  })

  it('refuses an inactive operator', async () => {
    m.requireOperatorAccount.mockResolvedValue({ ...OPERATOR, isActive: false })
    await expectSendError(send(), 'operator_inactive')
    expect(m.translateTexts).not.toHaveBeenCalled()
  })

  it("requires the operator's primary language instead of falling back to room languages", async () => {
    m.requireOperatorAccount.mockResolvedValue({ ...OPERATOR, primaryLanguages: [] })
    await expectSendError(send(), 'persona_language_missing')
    expect(m.translateTexts).not.toHaveBeenCalled()
    expect(m.txMessageCreate).not.toHaveBeenCalled()
  })

  it('refuses when the operator is not an active member (pending invitee or left)', async () => {
    m.listMembers.mockResolvedValue(null)
    const error = await expectSendError(send(), 'not_member')
    expect(error.status).toBe(403)
    expect(m.listMembers).toHaveBeenCalledWith({ conversationId: 'conv_1', userId: 'op_1' })
    expect(m.translateTexts).not.toHaveBeenCalled()
    expect(m.txMessageCreate).not.toHaveBeenCalled()
  })

  it('refuses a blocked room', async () => {
    m.isBlocked.mockResolvedValue(true)
    await expectSendError(send(), 'blocked')
    expect(m.isBlocked).toHaveBeenCalledWith({ sessionKey: 'sess_1', userId: 'op_1' })
    expect(m.translateTexts).not.toHaveBeenCalled()
  })

  it('refuses a room with nobody left to read the reply', async () => {
    m.listMembers.mockResolvedValue([member('op_1', ['pt'])])
    await expectSendError(send(), 'no_recipients')
  })

  it('refuses an unknown or deleted room', async () => {
    m.channelFindFirst.mockResolvedValue(null)
    const error = await expectSendError(send(), 'conversation_not_found')
    expect(error.status).toBe(404)
  })

  it('validates the text and the request id', async () => {
    await expectSendError(send({ text: '   ' }), 'empty_text')
    await expectSendError(send({ text: 'a'.repeat(2001) }), 'text_too_long')
    await expectSendError(send({ clientRequestId: 'bad id!' }), 'invalid_request_id')
    expect(m.requireOperatorAccount).not.toHaveBeenCalled()
  })

  it('stores the persona-language text as SOURCE and the other room languages from the staff original', async () => {
    const result = await send()

    expect(m.translateTexts).toHaveBeenCalledTimes(1)
    expect(m.translateTexts).toHaveBeenCalledWith(expect.objectContaining({
      text: '안녕하세요, 반가워요',
      targetLanguages: ['pt', 'en', 'ko'],
      redetectSourceLanguage: true,
    }))
    expect(m.txMessageCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userId: 'op_1',
        sessionKey: 'sess_1',
        clientMessageId: 'op-req-00000001',
        sourceLanguage: 'pt',
        translationTotalTokens: 15,
        metadata: expect.objectContaining({ source: 'operator_reply', translationTargetLanguages: ['pt', 'en', 'ko'] }),
      }),
    }))
    const rows = contentRows()
    expect(rows.filter((row) => row.contentType === 'SOURCE')).toEqual([
      expect.objectContaining({ contentType: 'SOURCE', language: 'pt', text: 'Olá, prazer!', messageId: 'msg_1' }),
    ])
    expect(rows.filter((row) => row.contentType === 'TRANSLATION_FINAL').map(({ language, text }) => ({ language, text }))).toEqual([
      { language: 'en', text: 'Hi, nice to meet you!' },
      { language: 'ko', text: '안녕하세요, 반가워요' },
    ])
    // The staff original never becomes a SOURCE row.
    expect(rows.some((row) => row.contentType === 'SOURCE' && row.language === 'ko')).toBe(false)

    expect(result).toMatchObject({
      duplicate: false,
      messageId: 'msg_1',
      clientMessageId: 'op-req-00000001',
      staffLanguage: 'ko',
      utterance: {
        id: 'op-req-00000001',
        originalText: 'Olá, prazer!',
        originalLang: 'pt',
        speakerUserId: 'op_1',
        speakerName: 'Mina',
        speakerBadge: 'operator',
        serverMessageId: 'msg_1',
        createdAtMs: CREATED_AT.getTime(),
      },
    })
  })

  it('audits the reply with the staff original, then notifies realtime, push and the operator inbox', async () => {
    await send()

    expect(m.writeAdminAudit).toHaveBeenCalledWith(ctx, {
      action: 'inbox.reply',
      operatorUserId: 'op_1',
      targetType: 'message',
      targetId: 'msg_1',
      metadata: expect.objectContaining({
        conversationId: 'conv_1',
        staffOriginal: '안녕하세요, 반가워요',
        staffLanguage: 'ko',
        sourceLanguage: 'pt',
      }),
    })
    expect(m.materialize).toHaveBeenCalledWith('sess_1', CREATED_AT)
    expect(m.notifyConversationMessage).toHaveBeenCalledWith('sess_1', ['op_1', 'user_1'], expect.objectContaining({
      id: 'op-req-00000001',
      originalText: 'Olá, prazer!',
      originalLang: 'pt',
      speakerUserId: 'op_1',
      speakerBadge: 'operator',
      serverMessageId: 'msg_1',
    }), { timeoutMs: 3000 })
    expect(m.sendPush).toHaveBeenCalledWith({
      messageId: 'msg_1',
      sessionKey: 'sess_1',
      sourceText: 'Olá, prazer!',
      senderUserId: 'op_1',
      memberUserIds: ['op_1', 'user_1'],
    })
    expect(m.notifyInbox).toHaveBeenCalledWith({
      sessionKey: 'sess_1',
      conversationId: 'conv_1',
      senderUserId: 'op_1',
      memberUserIds: ['op_1', 'user_1'],
      messageId: 'msg_1',
      preview: 'Olá, prazer!',
      kind: 'text',
    })
    expect(m.writeAdminAudit.mock.invocationCallOrder[0]).toBeLessThan(m.notifyConversationMessage.mock.invocationCallOrder[0])
    expect(m.trackedEventLog).not.toHaveBeenCalled()
    expect(m.trackedActivity).not.toHaveBeenCalled()
  })

  it('fans out to the members returned by materialization when invitees were pending', async () => {
    m.materialize.mockResolvedValue(['op_1', 'user_1', 'user_2'])
    await send()
    expect(m.listMemberIds).not.toHaveBeenCalled()
    expect(m.sendPush).toHaveBeenCalledWith(expect.objectContaining({ memberUserIds: ['op_1', 'user_1', 'user_2'] }))
  })

  it('fails with a retryable error and stores nothing when the persona translation fails', async () => {
    m.translateTexts.mockRejectedValue(new Error('Provider rate-limited. Retry in 30s.'))
    const error = await expectSendError(send(), 'translation_failed')
    expect(error.retryable).toBe(true)
    expect(error.status).toBe(503)
    expect(m.txMessageCreate).not.toHaveBeenCalled()
    expect(m.writeAdminAudit).not.toHaveBeenCalled()
    expect(m.notifyConversationMessage).not.toHaveBeenCalled()
    expect(m.sendPush).not.toHaveBeenCalled()
  })

  it('never falls back to the staff original when the model skips the persona language', async () => {
    m.translateTexts.mockResolvedValue({
      translations: { en: 'Hi', ko: '안녕하세요, 반가워요' },
      detectedSourceLanguage: 'ko',
      provider: 'gemini',
      model: 'gemini-test',
    })
    await expectSendError(send(), 'translation_failed')
    expect(m.txMessageCreate).not.toHaveBeenCalled()
  })

  it('uses the staff text itself when it is already in the persona language', async () => {
    m.translateTexts.mockResolvedValue({
      translations: { en: 'Hi', ko: '안녕' },
      detectedSourceLanguage: 'pt',
      provider: 'gemini',
      model: 'gemini-test',
    })
    await send({ text: 'Oi, tudo bem?' })
    expect(contentRows()[0]).toMatchObject({ contentType: 'SOURCE', language: 'pt', text: 'Oi, tudo bem?' })
  })

  it('retries once for room languages the first call missed, and still sends when that fails', async () => {
    m.translateTexts
      .mockResolvedValueOnce({ translations: { pt: 'Olá' }, detectedSourceLanguage: 'ko', provider: 'gemini', model: 'm' })
      .mockRejectedValueOnce(new Error('boom'))
    await send()
    expect(m.translateTexts).toHaveBeenCalledTimes(2)
    // 'ko' is the staff's own language, so only 'en' needed a retry.
    expect(m.translateTexts.mock.calls[1][0]).toMatchObject({ targetLanguages: ['en'], sourceLanguage: 'ko' })
    const rows = contentRows()
    expect(rows.map((row) => `${row.contentType}:${row.language}`)).toEqual(['SOURCE:pt', 'TRANSLATION_FINAL:ko'])
  })

  it('returns the stored reply for a repeated request id without sending again', async () => {
    m.messageFindUnique.mockResolvedValue({
      id: 'msg_1',
      userId: 'op_1',
      isDeleted: false,
      createdAt: CREATED_AT,
      sourceLanguage: 'pt',
      metadata: { translationTargetLanguages: ['pt', 'en'] },
      contents: [
        { contentType: 'SOURCE', language: 'pt', text: 'Olá' },
        { contentType: 'TRANSLATION_FINAL', language: 'en', text: 'Hi' },
      ],
    })
    const result = await send()
    expect(result).toMatchObject({ duplicate: true, messageId: 'msg_1', utterance: { originalText: 'Olá', translations: { en: 'Hi' } } })
    expect(m.messageFindUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { sessionKey_clientMessageId: { sessionKey: 'sess_1', clientMessageId: 'op-req-00000001' } },
    }))
    expect(m.translateTexts).not.toHaveBeenCalled()
    expect(m.txMessageCreate).not.toHaveBeenCalled()
    expect(m.sendPush).not.toHaveBeenCalled()
    expect(m.writeAdminAudit).not.toHaveBeenCalled()
  })

  it('sends a concurrent retry of the same request only once', async () => {
    let release!: () => void
    m.translateTexts.mockImplementationOnce(() => new Promise((resolve) => {
      release = () => resolve({ translations: { pt: 'Olá', en: 'Hi', ko: '안녕' }, detectedSourceLanguage: 'ko', provider: 'g', model: 'm' })
    }))
    const first = send()
    const second = send()
    await vi.waitFor(() => expect(m.translateTexts).toHaveBeenCalledTimes(1))
    release()
    const [a, b] = await Promise.all([first, second])
    expect(a.duplicate).toBe(false)
    expect(b.duplicate).toBe(true)
    expect(m.txMessageCreate).toHaveBeenCalledTimes(1)
    expect(m.sendPush).toHaveBeenCalledTimes(1)
  })

  it('treats a lost insert race (unique violation) as the stored reply', async () => {
    m.txMessageCreate.mockRejectedValue(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }))
    m.messageFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'msg_other',
        userId: 'op_1',
        isDeleted: false,
        createdAt: CREATED_AT,
        sourceLanguage: 'pt',
        metadata: null,
        contents: [{ contentType: 'SOURCE', language: 'pt', text: 'Olá' }],
      })
    const result = await send()
    expect(result).toMatchObject({ duplicate: true, messageId: 'msg_other' })
    expect(m.sendPush).not.toHaveBeenCalled()
  })

  it('keeps a committed reply successful when a delivery step fails', async () => {
    m.notifyConversationMessage.mockRejectedValue(new Error('publish down'))
    m.sendPush.mockRejectedValue(new Error('apns down'))
    m.notifyInbox.mockRejectedValue(new Error('notify down'))
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(send()).resolves.toMatchObject({ duplicate: false, messageId: 'msg_1' })
    expect(m.writeAdminAudit).toHaveBeenCalledOnce()
    errorLog.mockRestore()
  })
})

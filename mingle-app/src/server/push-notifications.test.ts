import { generateKeyPairSync } from 'node:crypto'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { LEGAL_DOCUMENT_LOCALES } from '@/i18n/config'

const m = vi.hoisted(() => ({
  userFindMany: vi.fn(),
  notificationFindUnique: vi.fn(),
  channelFindUnique: vi.fn(),
  tokenDeleteMany: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findMany: m.userFindMany },
    userNotification: { findUnique: m.notificationFindUnique },
    appConversationChannel: { findUnique: m.channelFindUnique },
    userPushToken: { deleteMany: m.tokenDeleteMany },
  },
}))

import {
  resolvePushCopy,
  sendPushNotificationForConversationMessage,
  sendPushNotificationForUserNotification,
  sendPushToUsers,
  type PushMessage,
} from './push-notifications'

const FCM_SEND_URL = 'https://fcm.googleapis.com/v1/projects/test-project/messages:send'
const deadTokens = new Set<string>()
async function fakeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input)
  if (url === 'https://oauth2.googleapis.com/token') {
    return new Response(JSON.stringify({ access_token: 'test-access-token', expires_in: 3600 }), { status: 200 })
  }
  if (url === FCM_SEND_URL) {
    const body = JSON.parse(String(init?.body)) as { message: { token: string } }
    return deadTokens.has(body.message.token)
      ? new Response('{"error":{"status":"NOT_FOUND","details":["UNREGISTERED"]}}', { status: 404 })
      : new Response('{}', { status: 200 })
  }
  throw new Error(`unexpected fetch: ${url}`)
}
const fetchMock = vi.fn(fakeFetch)

type SentFcmMessage = { token: string; notification: { title: string; body: string }; data: Record<string, string> }

function sentMessages(): SentFcmMessage[] {
  return fetchMock.mock.calls
    .filter(([input]) => String(input) === FCM_SEND_URL)
    .map(([, init]) => (JSON.parse(String(init?.body)) as { message: SentFcmMessage }).message)
    .sort((left, right) => left.token.localeCompare(right.token))
}

function sentBodyByToken(): Record<string, string> {
  return Object.fromEntries(sentMessages().map((message) => [message.token, message.notification.body]))
}

function androidToken(id: string) {
  return { id, platform: 'android', token: `fcm-${id}`, environment: 'production' }
}

function message(overrides: Partial<PushMessage>): PushMessage {
  return {
    notificationId: 'n1',
    type: 'conversation_message',
    actorId: 'actor_1',
    actorLabel: 'Ada',
    recipientLanguage: 'en',
    messagePreview: 'hi',
    ...overrides,
  }
}

let fcmPrivateKey = ''

beforeAll(() => {
  // A throwaway key: FCM calls are intercepted by the fetch mock, but the
  // OAuth assertion is still signed for real.
  fcmPrivateKey = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  }).privateKey
})

beforeEach(() => {
  vi.resetAllMocks()
  deadTokens.clear()
  fetchMock.mockImplementation(fakeFetch)
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('APNS_TEAM_ID', '')
  vi.stubEnv('FCM_PROJECT_ID', 'test-project')
  vi.stubEnv('FCM_CLIENT_EMAIL', 'push@test-project.iam.gserviceaccount.com')
  vi.stubEnv('FCM_PRIVATE_KEY', fcmPrivateKey)
  m.channelFindUnique.mockResolvedValue({ id: 'chan_1' })
  m.tokenDeleteMany.mockResolvedValue({ count: 0 })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('resolvePushCopy: conversation_message', () => {
  it('has a translated title in every one of the 15 primary UI languages', () => {
    const titles = new Set<string>()
    for (const locale of LEGAL_DOCUMENT_LOCALES) {
      const copy = resolvePushCopy(message({ recipientLanguage: locale }))
      expect(copy.title.trim(), locale).not.toBe('')
      expect(copy.body, locale).toContain('Ada')
      expect(copy.body, locale).toContain('hi')
      titles.add(copy.title)
    }
    expect(titles.size).toBe(15)
  })

  it('covers it, ru, ar, hi, th and vi (previously English)', () => {
    const english = resolvePushCopy(message({ recipientLanguage: 'en' })).title
    for (const language of ['it', 'ru', 'ar', 'hi', 'th', 'vi']) {
      expect(resolvePushCopy(message({ recipientLanguage: language })).title, language).not.toBe(english)
    }
  })

  it('keeps the existing per-language formats', () => {
    expect(resolvePushCopy(message({ recipientLanguage: 'ko' }))).toEqual({ title: '새 메시지', body: 'Ada님: hi' })
    expect(resolvePushCopy(message({ recipientLanguage: 'ja' }))).toEqual({ title: '新しいメッセージ', body: 'Adaさん: hi' })
    expect(resolvePushCopy(message({ recipientLanguage: 'zh-cn' }))).toEqual({ title: '新消息', body: 'Ada：hi' })
    expect(resolvePushCopy(message({ recipientLanguage: 'zh-TW' }))).toEqual({ title: '新訊息', body: 'Ada：hi' })
    expect(resolvePushCopy(message({ recipientLanguage: 'fr' }))).toEqual({ title: 'Nouveau message', body: 'Ada : hi' })
    expect(resolvePushCopy(message({ recipientLanguage: 'en' }))).toEqual({ title: 'New message', body: 'Ada: hi' })
  })

  it('resolves region tags and falls back to English for an unknown language', () => {
    expect(resolvePushCopy(message({ recipientLanguage: 'ko-KR' })).title).toBe('새 메시지')
    expect(resolvePushCopy(message({ recipientLanguage: 'pt-BR' })).title).toBe('Nova mensagem')
    expect(resolvePushCopy(message({ recipientLanguage: 'xx' })).title).toBe('New message')
  })

  it('collapses whitespace in the preview and never sends an empty one', () => {
    expect(resolvePushCopy(message({ messagePreview: '  a \n b ' })).body).toBe('Ada: a b')
    expect(resolvePushCopy(message({ messagePreview: '   ' })).body).toBe('Ada: …')
  })
})

describe('resolvePushCopy: operator_inbox_message (placeholder copy)', () => {
  it('uses the Korean title for Korean staff and English otherwise', () => {
    expect(resolvePushCopy(message({ type: 'operator_inbox_message', recipientLanguage: 'ko', messagePreview: 'hello' })))
      .toEqual({ title: '운영 계정 새 메시지', body: 'Ada: hello' })
    expect(resolvePushCopy(message({ type: 'operator_inbox_message', recipientLanguage: 'ja', messagePreview: 'hello' })))
      .toEqual({ title: 'New message for a Mingle-run account', body: 'Ada: hello' })
  })
})

describe('sendPushNotificationForConversationMessage', () => {
  function roomWith(sender: Record<string, unknown>) {
    m.userFindMany.mockResolvedValue([
      { id: 'sender', name: 'Mina', handle: 'mina', isOfficial: false, isOperator: false, language: 'en', pageLanguage: null, pushTokens: [], ...sender },
      { id: 'ko_user', name: 'Jiwoo', handle: 'jiwoo', isOfficial: false, isOperator: false, language: 'ko-KR', pageLanguage: 'ko', pushTokens: [androidToken('ko')] },
      { id: 'en_user', name: 'Ann', handle: 'ann', isOfficial: false, isOperator: false, language: 'en', pageLanguage: null, pushTokens: [androidToken('en')] },
    ])
  }

  async function send() {
    await sendPushNotificationForConversationMessage({
      messageId: 'msg_1',
      sessionKey: 'sess_1',
      sourceText: '안녕',
      senderUserId: 'sender',
      memberUserIds: ['sender', 'ko_user', 'en_user'],
    })
  }

  it('labels an operator sender in each recipient\'s own language', async () => {
    roomWith({ isOperator: true })
    await send()
    expect(m.userFindMany).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({ isOfficial: true, isOperator: true }),
    }))
    expect(sentBodyByToken()).toEqual({
      'fcm-ko': 'Mina (운영 계정)님: 안녕',
      'fcm-en': 'Mina (Run by Mingle): 안녕',
    })
    const [first] = sentMessages()
    expect(first.data).toMatchObject({ type: 'conversation_message', conversationId: 'chan_1', notificationId: 'msg_1' })
  })

  it('labels an official sender as official', async () => {
    roomWith({ isOfficial: true })
    await send()
    expect(sentBodyByToken()).toEqual({ 'fcm-ko': 'Mina (공식)님: 안녕', 'fcm-en': 'Mina (Official): 안녕' })
  })

  it('leaves a regular sender\'s name unchanged', async () => {
    roomWith({})
    await send()
    expect(sentBodyByToken()).toEqual({ 'fcm-ko': 'Mina님: 안녕', 'fcm-en': 'Mina: 안녕' })
  })

  it('still deletes a dead token', async () => {
    roomWith({ isOperator: true })
    deadTokens.add('fcm-en')
    await send()
    expect(m.tokenDeleteMany).toHaveBeenCalledWith({ where: { id: { in: ['en'] } } })
  })
})

describe('sendPushNotificationForUserNotification', () => {
  it('labels an operator actor in the recipient\'s language', async () => {
    m.notificationFindUnique.mockResolvedValue({
      id: 'notif_1',
      type: 'follow',
      postId: null,
      commentId: null,
      recipient: { language: null, pageLanguage: 'ko', pushTokens: [androidToken('ko')] },
      actor: { id: 'op_1', handle: 'mina', name: 'Mina', isOfficial: false, isOperator: true },
    })
    await sendPushNotificationForUserNotification('notif_1')
    expect(m.notificationFindUnique.mock.calls[0][0].select.actor.select).toMatchObject({ isOfficial: true, isOperator: true })
    expect(sentMessages()).toHaveLength(1)
    expect(sentMessages()[0].notification).toEqual({ title: '새 팔로워', body: 'Mina (운영 계정)님이 회원님을 팔로우했습니다.' })
  })
})

describe('sendPushToUsers', () => {
  it('builds one message per recipient with a device and sends it to each device', async () => {
    m.userFindMany.mockResolvedValue([
      { id: 'staff_ko', language: 'en', pageLanguage: 'ko', pushTokens: [androidToken('a'), androidToken('b')] },
      { id: 'staff_en', language: null, pageLanguage: null, pushTokens: [androidToken('c')] },
      { id: 'no_device', language: 'ko', pageLanguage: null, pushTokens: [] },
    ])
    const build = vi.fn(({ userId, language }: { userId: string; language: string }) => message({
      type: 'operator_inbox_message',
      notificationId: `alert-${userId}`,
      recipientLanguage: language,
      messagePreview: 'hello',
      navigationUrl: '/admin/inbox/conv_1',
    }))
    await sendPushToUsers(['staff_ko', 'staff_en', 'no_device', 'staff_ko', ''], build)

    expect(m.userFindMany.mock.calls[0][0].where).toEqual({ id: { in: ['staff_ko', 'staff_en', 'no_device'] } })
    expect(build.mock.calls.map(([recipient]) => recipient)).toEqual([
      { userId: 'staff_ko', language: 'ko' },
      { userId: 'staff_en', language: 'en' },
    ])
    expect(sentMessages().map((sent) => [sent.token, sent.notification.title, sent.data.url])).toEqual([
      ['fcm-a', '운영 계정 새 메시지', '/admin/inbox/conv_1'],
      ['fcm-b', '운영 계정 새 메시지', '/admin/inbox/conv_1'],
      ['fcm-c', 'New message for a Mingle-run account', '/admin/inbox/conv_1'],
    ])
    expect(m.tokenDeleteMany).not.toHaveBeenCalled()
  })

  it('skips recipients the builder returns null for and deletes dead tokens', async () => {
    m.userFindMany.mockResolvedValue([
      { id: 'skip', language: 'en', pageLanguage: null, pushTokens: [androidToken('s')] },
      { id: 'keep', language: 'en', pageLanguage: null, pushTokens: [androidToken('dead'), androidToken('live')] },
    ])
    deadTokens.add('fcm-dead')
    await sendPushToUsers(['skip', 'keep'], async ({ userId }) => (userId === 'skip' ? null : message({ type: 'operator_inbox_message' })))
    expect(sentMessages().map((sent) => sent.token)).toEqual(['fcm-dead', 'fcm-live'])
    expect(m.tokenDeleteMany).toHaveBeenCalledWith({ where: { id: { in: ['dead'] } } })
  })

  it('does nothing without push credentials or recipients', async () => {
    vi.stubEnv('FCM_PROJECT_ID', '')
    const build = vi.fn()
    await sendPushToUsers(['staff_ko'], build)
    vi.stubEnv('FCM_PROJECT_ID', 'test-project')
    await sendPushToUsers([], build)
    expect(m.userFindMany).not.toHaveBeenCalled()
    expect(build).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

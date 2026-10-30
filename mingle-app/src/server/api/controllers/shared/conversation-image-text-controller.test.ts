import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { parseConversationImageTextResponse, type ConversationImageTextBlock } from '@/lib/conversation-image-text'

const m = vi.hoisted(() => ({
  session: vi.fn(), member: vi.fn(), rooms: vi.fn(), findFirst: vi.fn(), imageText: vi.fn(),
  after: vi.fn(), runJob: vi.fn(), runTranslations: vi.fn(),
}))
vi.mock('next/server', async importOriginal => ({ ...await importOriginal<typeof import('next/server')>(), after: m.after }))
vi.mock('next-auth', () => ({ getServerSession: m.session }))
vi.mock('@/lib/auth-options', () => ({ getAuthOptions: () => ({}) }))
vi.mock('@/lib/app-conversations', () => ({ getConversationSessionKeyForMember: m.member, listConversationTranslationLanguagesBySessionKey: m.rooms }))
vi.mock('@/lib/prisma', () => ({ prisma: { appMessage: { findFirst: m.findFirst }, appMessageImageText: { findUnique: m.imageText } } }))
vi.mock('@/server/conversation-image-storage', () => ({ getConversationImage: vi.fn() }))
vi.mock('@/server/conversation-image-text-provider', async importOriginal => ({
  ...await importOriginal<typeof import('@/server/conversation-image-text-provider')>(),
  extractConversationImageText: vi.fn(),
  translateConversationImageTextBlocks: vi.fn(),
}))
// Real read model; the background runners are spies.
vi.mock('@/server/conversation-image-text', async importOriginal => ({
  ...await importOriginal<typeof import('@/server/conversation-image-text')>(),
  runConversationImageTextJob: m.runJob,
  runConversationImageTextTranslations: m.runTranslations,
}))
import { readConversationImageText } from './conversation-image-text-controller'

const url = 'http://localhost/api/conversations/room/images/db-image/text'
const photo = { metadata: { image: { objectKey: 'conversation-images/key.jpg', sha256: 'hash', width: 1000, height: 750 } } }
const blocks: ConversationImageTextBlock[] = [
  { id: 'b0', box: [0.11, 0.14, 0.35, 0.22], text: '営業時間', sourceLanguage: 'ja', angle: 0, lines: 1, style: { background: '#ffffff', color: '#1a1a1a', bold: true } },
  { id: 'b1', box: [0.85, 0.12, 0.9, 0.58], text: '本日のおすすめ', sourceLanguage: 'ja', angle: 0, lines: 1, vertical: true },
]

function get(query = '', headers: Record<string, string> = {}) {
  return readConversationImageText(new NextRequest(`${url}${query}`, { headers }), 'room', 'db-image')
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('GEMINI_API_KEY', 'test-key')
  vi.stubEnv('CONVERSATION_IMAGE_TEXT_ENABLED', '')
  m.session.mockResolvedValue({ user: { id: 'viewer' } })
  m.member.mockResolvedValue('session')
  m.findFirst.mockResolvedValue(photo)
  m.rooms.mockResolvedValue({ languages: ['ko', 'en'], viewerDisplayLanguage: 'ja' })
  m.imageText.mockResolvedValue(null)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('GET conversation image text', () => {
  it.each([
    ['anonymous', 401],
    ['stale account', 401],
    ['non-member', 404],
    ['deleted or missing message', 404],
    ['message without a stored photo', 404],
  ])('rejects a %s request before reading image text', async (who, status) => {
    const headers: Record<string, string> = {}
    if (who === 'anonymous') m.session.mockResolvedValue(null)
    if (who === 'stale account') headers['x-mingle-expected-account-id'] = 'previous-account'
    if (who === 'non-member') m.member.mockResolvedValue(null)
    if (who === 'deleted or missing message') m.findFirst.mockResolvedValue(null)
    if (who === 'message without a stored photo') m.findFirst.mockResolvedValue({ metadata: { image: { objectKey: 'elsewhere/key.png', sha256: 'hash', width: 1, height: 1 } } })
    expect((await get('', headers)).status).toBe(status)
    expect(m.imageText).not.toHaveBeenCalled()
    expect(m.after).not.toHaveBeenCalled()
  })

  it('only reads visible messages of the authorized room', async () => {
    await get()
    expect(m.member).toHaveBeenCalledWith({ conversationId: 'room', userId: 'viewer' })
    expect(m.findFirst.mock.calls[0][0].where).toEqual({ id: 'db-image', sessionKey: 'session', OR: [{ isDeleted: null }, { isDeleted: false }] })
  })

  it('answers disabled without reading or scheduling anything when the kill switch is off', async () => {
    vi.stubEnv('CONVERSATION_IMAGE_TEXT_ENABLED', 'false')
    const response = await get('?languages=ko')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'disabled', blocks: [], translations: [] })
    expect(m.imageText).not.toHaveBeenCalled()
    expect(m.after).not.toHaveBeenCalled()
  })

  it.each([
    ['?languages=zz,xx', 400],
    ['?languages=,,', 400],
    [`?languages=${'ko,'.repeat(100)}`, 400],
  ])('rejects the languages value %s', async (query, status) => {
    expect((await get(query)).status).toBe(status)
    expect(m.imageText).not.toHaveBeenCalled()
  })

  it('limits languages to the room languages plus the viewer display language, in request order', async () => {
    m.imageText.mockResolvedValue({ status: 'ready', attemptCount: 1, deadlineAt: new Date(), blocks, translations: [] })
    const body = await (await get('?languages=fr,ja,KO,zh-Hant')).json()
    expect(m.rooms).toHaveBeenCalledWith('session', 'viewer')
    expect(m.imageText.mock.calls[0][0].select.translations.where).toEqual({ language: { in: ['ja', 'ko'] } })
    // ja has nothing to translate (every block is Japanese), so only ko is listed.
    expect(body.translations).toEqual([{ language: 'ko', status: 'pending', texts: {} }])
  })

  it('uses the room languages when languages is absent or empty', async () => {
    await get()
    await get('?languages=')
    for (const [call] of m.imageText.mock.calls) {
      expect(call.select.translations.where).toEqual({ language: { in: ['ko', 'en'] } })
    }
  })

  it('reports pending for a photo without a job and schedules OCR from storage in after()', async () => {
    const response = await get('?languages=ko')
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.json()).toEqual({ status: 'pending', blocks: [], translations: [], retryAfterMs: 1500 })
    expect(m.after).toHaveBeenCalledTimes(1)
    expect(m.runJob).not.toHaveBeenCalled()
    await m.after.mock.calls[0][0]()
    expect(m.runJob).toHaveBeenCalledWith({ messageId: 'db-image', sessionKey: 'session', imageSha256: 'hash', objectKey: 'conversation-images/key.jpg', billedUserId: null })
  })

  it('does not schedule anything while OCR is running', async () => {
    m.imageText.mockResolvedValue({ status: 'running', attemptCount: 1, deadlineAt: new Date(Date.now() + 60_000), blocks: null, translations: [] })
    expect(await (await get()).json()).toMatchObject({ status: 'pending' })
    expect(m.after).not.toHaveBeenCalled()
  })

  it('maps a ready photo to the contract and schedules only the missing translations', async () => {
    m.imageText.mockResolvedValue({
      status: 'ready', attemptCount: 1, deadlineAt: new Date(), blocks,
      translations: [{ language: 'ko', status: 'ready', attemptCount: 1, deadlineAt: new Date(), texts: { b0: '영업시간', b1: '오늘의 추천' } }],
    })
    const response = await get('?languages=ko,en')
    const body = await response.json()
    expect(body).toEqual({
      status: 'ready',
      blocks,
      translations: [
        { language: 'ko', status: 'ready', texts: { b0: '영업시간', b1: '오늘의 추천' } },
        { language: 'en', status: 'pending', texts: {} },
      ],
      retryAfterMs: 1500,
    })
    // The client parser accepts the body unchanged.
    expect(parseConversationImageTextResponse(body)).toEqual(body)
    expect(m.after).toHaveBeenCalledTimes(1)
    await m.after.mock.calls[0][0]()
    expect(m.runTranslations).toHaveBeenCalledWith({ messageId: 'db-image', languages: ['en'], billedUserId: null, sessionKey: 'session' })
    expect(m.runJob).not.toHaveBeenCalled()
  })

  it('answers 503 when the image text store cannot be read', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    m.imageText.mockRejectedValue(Object.assign(new Error('relation does not exist'), { name: 'PrismaClientKnownRequestError' }))
    const response = await get()
    expect(response.status).toBe(503)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(m.after).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalled()
  })
})

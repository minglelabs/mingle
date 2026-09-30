import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConversationImageTextBlock } from '@/lib/conversation-image-text'

// In-memory stand-in for the two tables, implementing exactly the Prisma
// operators the service uses (equality, lt, in, OR, increment, skipDuplicates),
// so claims and conditional writes behave like the real conditional UPDATEs.
const db = vi.hoisted(() => {
  type Row = Record<string, unknown>
  const images = new Map<string, Row>()
  const translations = new Map<string, Row>()

  function matches(row: Row, where: Record<string, unknown>): boolean {
    return Object.entries(where).every(([key, condition]) => {
      if (key === 'OR') return (condition as Record<string, unknown>[]).some(entry => matches(row, entry))
      const value = row[key]
      if (condition && typeof condition === 'object' && !(condition instanceof Date)) {
        const operators = condition as { lt?: unknown; in?: unknown[] }
        if ('lt' in operators) {
          const limit = operators.lt instanceof Date ? operators.lt.getTime() : operators.lt as number
          const current = value instanceof Date ? value.getTime() : value as number
          if (!(current < limit)) return false
        }
        if ('in' in operators && !(operators.in ?? []).includes(value)) return false
        return true
      }
      return value === condition
    })
  }
  function apply(row: Row, data: Record<string, unknown>) {
    for (const [key, value] of Object.entries(data)) {
      row[key] = value && typeof value === 'object' && 'increment' in value
        ? (row[key] as number) + (value as { increment: number }).increment
        : value
    }
  }
  function project(row: Row, select?: Record<string, unknown>): Row {
    if (!select) return { ...row }
    const output: Row = {}
    for (const [key, value] of Object.entries(select)) {
      if (key === 'translations') {
        const relation = value as { where?: Record<string, unknown>; select?: Record<string, unknown> }
        output.translations = [...translations.values()]
          .filter(entry => entry.messageId === row.messageId && matches(entry, relation.where ?? {}))
          .map(entry => project(entry, relation.select))
      } else if (value) {
        output[key] = row[key]
      }
    }
    return output
  }
  function table(rows: Map<string, Row>, keyOf: (row: Row) => string, defaults: Row) {
    return {
      createMany: async ({ data, skipDuplicates }: { data: Row[]; skipDuplicates?: boolean }) => {
        let count = 0
        for (const entry of data) {
          const key = keyOf(entry)
          if (rows.has(key)) {
            if (skipDuplicates) continue
            throw Object.assign(new Error('unique'), { code: 'P2002' })
          }
          rows.set(key, { ...defaults, ...entry, createdAt: new Date(), updatedAt: new Date() })
          count += 1
        }
        return { count }
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        let count = 0
        for (const row of rows.values()) {
          if (!matches(row, where)) continue
          apply(row, { ...data, updatedAt: new Date() })
          count += 1
        }
        return { count }
      },
      findUnique: async ({ where, select }: { where: Record<string, unknown>; select?: Record<string, unknown> }) => {
        const compound = where.messageId_language as Row | undefined
        const row = rows.get(compound ? keyOf(compound) : keyOf(where))
        return row ? project(row, select) : null
      },
    }
  }
  const prisma = {
    appMessageImageText: table(images, row => String(row.messageId), { status: 'queued', attemptId: null, attemptCount: 0, blocks: null, errorCode: null }),
    appMessageImageTextTranslation: table(translations, row => `${row.messageId}|${row.language}`, { status: 'running', attemptCount: 0, texts: null, derivedFrom: null, errorCode: null }),
  }
  return { images, translations, prisma }
})

const m = vi.hoisted(() => ({ extract: vi.fn(), translate: vi.fn(), rooms: vi.fn(), getImage: vi.fn() }))

vi.mock('@/lib/prisma', () => ({ prisma: db.prisma }))
vi.mock('@/lib/app-conversations', () => ({ listConversationTranslationLanguagesBySessionKey: m.rooms }))
vi.mock('@/server/conversation-image-storage', () => ({ getConversationImage: m.getImage }))
vi.mock('@/server/conversation-image-text-provider', async importOriginal => ({
  ...await importOriginal<typeof import('@/server/conversation-image-text-provider')>(),
  extractConversationImageText: m.extract,
  translateConversationImageTextBlocks: m.translate,
}))

type Service = typeof import('./conversation-image-text')
let service: Service

const usage = { inputTokens: 1100, outputTokens: 400, thoughtTokens: 20 }
const job = { messageId: 'msg-1', sessionKey: 'session-1', imageSha256: 'sha-1', objectKey: 'conversation-images/key.jpg', jpeg: new Uint8Array([1, 2, 3]) }

function block(id: string, text: string, sourceLanguage: string | null): ConversationImageTextBlock {
  return { id, box: [0.1, 0.1, 0.5, 0.2], text, sourceLanguage, angle: 0, lines: 1 }
}

const japaneseSign = [block('b0', '営業時間', 'ja'), block('b1', 'CAFE MINGLE', 'en'), block('b2', 'ご来店ありがとうございます', 'ja')]

function ocrResult(blocks: ConversationImageTextBlock[]) {
  return { blocks, model: 'gemini-3.8-flash', usage, latencyMs: 5000, fallbackUsed: false }
}

// Echo translation: '<language>:<text>' for every block it receives.
function echoTranslation(blocks: ConversationImageTextBlock[], language: string) {
  return {
    texts: Object.fromEntries(blocks.map(entry => [entry.id, `${language}:${entry.text}`])),
    model: 'gemini-3.5-flash-lite',
    usage: { inputTokens: 150, outputTokens: 30, thoughtTokens: 0 },
    latencyMs: 1900,
    fallbackUsed: false,
  }
}

function expire(row: Record<string, unknown> | undefined) {
  if (row) row.deadlineAt = new Date(Date.now() - 1)
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

beforeEach(async () => {
  db.images.clear()
  db.translations.clear()
  vi.resetAllMocks()
  vi.stubEnv('GEMINI_API_KEY', 'test-key')
  vi.stubEnv('CONVERSATION_IMAGE_TEXT_ENABLED', '')
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  m.rooms.mockResolvedValue({ languages: [], viewerDisplayLanguage: null })
  m.translate.mockImplementation(async (blocks: ConversationImageTextBlock[], language: string) => echoTranslation(blocks, language))
  vi.resetModules()
  service = await import('./conversation-image-text')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('OCR job', () => {
  it('stores the blocks and usage, then eagerly translates the room languages except the source language', async () => {
    m.extract.mockResolvedValue(ocrResult(japaneseSign))
    m.rooms.mockResolvedValue({ languages: ['ko', 'ja', 'en'], viewerDisplayLanguage: null })

    await service.runConversationImageTextJob(job)

    expect(m.extract).toHaveBeenCalledWith(job.jpeg, expect.objectContaining({ signal: expect.any(AbortSignal) }))
    expect(m.getImage).not.toHaveBeenCalled()
    expect(db.images.get('msg-1')).toMatchObject({
      status: 'ready', imageSha256: 'sha-1', attemptCount: 1, blocks: japaneseSign, sourceLanguage: 'ja',
      provider: 'gemini', model: 'gemini-3.8-flash', promptTokens: 1100, completionTokens: 420, errorCode: null,
    })
    expect(m.rooms).toHaveBeenCalledWith('session-1')
    // ja is the source of b0/b2: only the English block goes to ja.
    expect(m.translate.mock.calls.map(([blocks, language]) => [language, blocks.map((entry: ConversationImageTextBlock) => entry.id)])).toEqual([
      ['ko', ['b0', 'b1', 'b2']],
      ['ja', ['b1']],
      ['en', ['b0', 'b2']],
    ])
    expect(db.translations.get('msg-1|en')).toMatchObject({
      status: 'ready', attemptCount: 1, texts: { b0: 'en:営業時間', b2: 'en:ご来店ありがとうございます' },
      provider: 'gemini', model: 'gemini-3.5-flash-lite', promptTokens: 150, completionTokens: 30, derivedFrom: null,
    })
  })

  it('skips languages that have nothing to translate', async () => {
    m.extract.mockResolvedValue(ocrResult([block('b0', '메뉴', 'ko')]))
    m.rooms.mockResolvedValue({ languages: ['ko'], viewerDisplayLanguage: null })
    await service.runConversationImageTextJob(job)
    expect(db.images.get('msg-1')?.status).toBe('ready')
    expect(m.translate).not.toHaveBeenCalled()
    expect(db.translations.size).toBe(0)
  })

  it('downloads the stored JPEG when it is not in memory', async () => {
    m.getImage.mockResolvedValue(new Uint8Array([9]))
    m.extract.mockResolvedValue(ocrResult([]))
    await service.runConversationImageTextJob({ ...job, jpeg: undefined })
    expect(m.getImage).toHaveBeenCalledWith('conversation-images/key.jpg')
    expect(m.extract).toHaveBeenCalledWith(new Uint8Array([9]), expect.anything())
  })

  it('marks a photo without text as empty and translates nothing', async () => {
    m.extract.mockResolvedValue(ocrResult([]))
    m.rooms.mockResolvedValue({ languages: ['ko'], viewerDisplayLanguage: null })
    await service.runConversationImageTextJob(job)
    expect(db.images.get('msg-1')).toMatchObject({ status: 'empty', blocks: [] })
    expect(m.rooms).not.toHaveBeenCalled()
    expect(service.mapConversationImageTextState(await readRow(), ['ko']).response).toEqual({ status: 'empty', blocks: [], translations: [] })
  })

  it('enforces the block and character limits on stored blocks', async () => {
    const many = Array.from({ length: 70 }, (_, index) => block(`x${index}`, `Item ${index}`, 'en'))
    many[0] = block('x0', 'a'.repeat(600), 'en')
    m.extract.mockResolvedValue(ocrResult(many))
    await service.runConversationImageTextJob(job)
    const stored = db.images.get('msg-1')?.blocks as ConversationImageTextBlock[]
    expect(stored).toHaveLength(60)
    expect(stored.map(entry => entry.id)).toEqual(Array.from({ length: 60 }, (_, index) => `b${index}`))
    expect(stored[0].text).toHaveLength(500)
  })

  it('claims once: duplicate calls in one process and a job running elsewhere do not repeat OCR', async () => {
    const gate = deferred<ReturnType<typeof ocrResult>>()
    m.extract.mockReturnValue(gate.promise)
    const first = service.runConversationImageTextJob(job)
    const second = service.runConversationImageTextJob(job)
    gate.resolve(ocrResult(japaneseSign))
    await Promise.all([first, second])
    expect(m.extract).toHaveBeenCalledTimes(1)

    // Another process holds a fresh claim on a second photo.
    db.images.set('msg-2', { messageId: 'msg-2', status: 'running', attemptId: 'other', attemptCount: 1, deadlineAt: new Date(Date.now() + 60_000) })
    await service.runConversationImageTextJob({ ...job, messageId: 'msg-2' })
    expect(m.extract).toHaveBeenCalledTimes(1)
    expect(db.images.get('msg-2')).toMatchObject({ status: 'running', attemptId: 'other' })
  })

  it('reclaims a stale attempt and ignores the late result of the attempt it replaced', async () => {
    const slow = deferred<ReturnType<typeof ocrResult>>()
    m.extract.mockReturnValueOnce(slow.promise)
    const stalled = service.runConversationImageTextJob(job)
    await vi.waitFor(() => expect(m.extract).toHaveBeenCalledTimes(1))
    const firstAttempt = db.images.get('msg-1')?.attemptId
    expire(db.images.get('msg-1'))

    // A second process (fresh module state) reclaims the stale job.
    vi.resetModules()
    const otherProcess: Service = await import('./conversation-image-text')
    const fresh = deferred<ReturnType<typeof ocrResult>>()
    m.extract.mockReturnValueOnce(fresh.promise)
    const reclaimed = otherProcess.runConversationImageTextJob(job)
    await vi.waitFor(() => expect(m.extract).toHaveBeenCalledTimes(2))
    const secondAttempt = db.images.get('msg-1')?.attemptId
    expect(db.images.get('msg-1')).toMatchObject({ status: 'running', attemptCount: 2 })
    expect(secondAttempt).not.toBe(firstAttempt)

    // The replaced attempt finishes while the new one still runs: it must not land.
    slow.resolve(ocrResult([block('b0', 'Late', 'en')]))
    await stalled
    expect(db.images.get('msg-1')).toMatchObject({ status: 'running', attemptId: secondAttempt, blocks: null })

    fresh.resolve(ocrResult([block('b0', 'Fresh', 'en')]))
    await reclaimed
    expect(db.images.get('msg-1')).toMatchObject({ status: 'ready', attemptCount: 2 })
    expect((db.images.get('msg-1')?.blocks as ConversationImageTextBlock[])[0].text).toBe('Fresh')
  })

  it('retries a failed OCR only after the cooldown and at most 3 times', async () => {
    m.extract.mockRejectedValue(new Error('provider_down'))
    await service.runConversationImageTextJob(job)
    expect(db.images.get('msg-1')).toMatchObject({ status: 'failed', attemptCount: 1, errorCode: 'provider_down' })

    await service.runConversationImageTextJob(job)
    expect(m.extract).toHaveBeenCalledTimes(1)
    expect(service.mapConversationImageTextState(await readRow(), []).response.status).toBe('pending')

    for (const attempt of [2, 3]) {
      expire(db.images.get('msg-1'))
      expect(service.mapConversationImageTextState(await readRow(), [])).toMatchObject({ response: { status: 'pending' }, runImageJob: true })
      await service.runConversationImageTextJob(job)
      expect(db.images.get('msg-1')).toMatchObject({ status: 'failed', attemptCount: attempt })
    }
    expire(db.images.get('msg-1'))
    await service.runConversationImageTextJob(job)
    expect(m.extract).toHaveBeenCalledTimes(3)
    expect(service.mapConversationImageTextState(await readRow(), [])).toEqual({
      response: { status: 'failed', blocks: [], translations: [] }, runImageJob: false, translateLanguages: [],
    })
  })

  it('does nothing when disabled or without a key', async () => {
    vi.stubEnv('CONVERSATION_IMAGE_TEXT_ENABLED', 'false')
    expect(service.isConversationImageTextEnabled()).toBe(false)
    await service.runConversationImageTextJob(job)
    vi.stubEnv('CONVERSATION_IMAGE_TEXT_ENABLED', 'true')
    vi.stubEnv('GEMINI_API_KEY', '')
    expect(service.isConversationImageTextEnabled()).toBe(false)
    await service.runConversationImageTextJob(job)
    expect(db.images.size).toBe(0)
    expect(m.extract).not.toHaveBeenCalled()
  })

  it('never throws when the table is missing', async () => {
    const createMany = db.prisma.appMessageImageText.createMany
    db.prisma.appMessageImageText.createMany = async () => { throw Object.assign(new Error('missing table'), { name: 'PrismaClientKnownRequestError' }) }
    try {
      await expect(service.runConversationImageTextJob(job)).resolves.toBeUndefined()
      expect(m.extract).not.toHaveBeenCalled()
    } finally {
      db.prisma.appMessageImageText.createMany = createMany
    }
  })
})

describe('translations', () => {
  async function readyPhoto(blocks: ConversationImageTextBlock[] = japaneseSign) {
    db.images.set('msg-1', { messageId: 'msg-1', status: 'ready', attemptCount: 1, deadlineAt: new Date(), blocks })
  }

  it('translates one Chinese variant and converts the other from it (zh sibling)', async () => {
    await readyPhoto()
    m.translate.mockImplementation(async (blocks: ConversationImageTextBlock[], language: string) => ({
      ...echoTranslation(blocks, language),
      texts: Object.fromEntries(blocks.map(entry => [entry.id, entry.id === 'b0' ? '營業時間' : `${language}:${entry.text}`])),
    }))

    await service.runConversationImageTextTranslations({ messageId: 'msg-1', languages: ['zh-TW', 'ko', 'zh-CN'] })

    expect(m.translate.mock.calls.map(([, language]) => language).sort()).toEqual(['ko', 'zh-TW'])
    expect(db.translations.get('msg-1|zh-TW')).toMatchObject({ status: 'ready', derivedFrom: null, provider: 'gemini' })
    expect(db.translations.get('msg-1|zh-CN')).toMatchObject({
      status: 'ready', derivedFrom: 'zh-TW', provider: 'opencc', model: null, promptTokens: null,
      texts: expect.objectContaining({ b0: '营业时间' }),
    })
  })

  it('converts a block written in the other Chinese variant instead of translating it', async () => {
    await readyPhoto([block('b0', '营业时间', 'zh-CN'), block('b1', '定休日', 'ja')])
    await service.runConversationImageTextTranslations({ messageId: 'msg-1', languages: ['zh-TW'] })
    expect(m.translate).toHaveBeenCalledTimes(1)
    expect(m.translate.mock.calls[0][0].map((entry: ConversationImageTextBlock) => entry.id)).toEqual(['b1'])
    expect(db.translations.get('msg-1|zh-TW')?.texts).toEqual({ b0: '營業時間', b1: 'zh-TW:定休日' })

    await readyPhoto([block('b0', '营业时间', 'zh-CN')])
    await service.runConversationImageTextTranslations({ messageId: 'msg-1', languages: ['zh-TW', 'zh-CN'] })
    expect(m.translate).toHaveBeenCalledTimes(1)
  })

  it('reclaims a stale translation, keeps a finished one, and stops after 3 failed attempts', async () => {
    await readyPhoto()
    db.translations.set('msg-1|ko', { messageId: 'msg-1', language: 'ko', status: 'running', attemptId: 'crashed', attemptCount: 1, deadlineAt: new Date(Date.now() - 1) })
    db.translations.set('msg-1|en', { messageId: 'msg-1', language: 'en', status: 'ready', attemptId: 'done', attemptCount: 1, deadlineAt: new Date(), texts: { b0: 'Hours' } })
    await service.runConversationImageTextTranslations({ messageId: 'msg-1', languages: ['ko', 'en'] })
    expect(m.translate.mock.calls.map(([, language]) => language)).toEqual(['ko'])
    expect(db.translations.get('msg-1|ko')).toMatchObject({ status: 'ready', attemptCount: 2 })
    expect(db.translations.get('msg-1|en')).toMatchObject({ texts: { b0: 'Hours' } })

    m.translate.mockRejectedValue(new Error('provider_down'))
    for (const attempt of [1, 2, 3]) {
      expire(db.translations.get('msg-1|ja'))
      await service.runConversationImageTextTranslations({ messageId: 'msg-1', languages: ['ja'] })
      expect(db.translations.get('msg-1|ja')).toMatchObject({ status: 'failed', attemptCount: attempt, errorCode: 'provider_down' })
    }
    expire(db.translations.get('msg-1|ja'))
    await service.runConversationImageTextTranslations({ messageId: 'msg-1', languages: ['ja'] })
    expect(m.translate.mock.calls.filter(([, language]) => language === 'ja')).toHaveLength(3)
    const state = service.mapConversationImageTextState(await readRow(), ['ja'])
    expect(state.response.translations).toEqual([{ language: 'ja', status: 'failed', texts: {} }])
    expect(state.translateLanguages).toEqual([])
  })

  it('does not translate before OCR is ready', async () => {
    db.images.set('msg-1', { messageId: 'msg-1', status: 'running', attemptCount: 1, deadlineAt: new Date(Date.now() + 60_000) })
    await service.runConversationImageTextTranslations({ messageId: 'msg-1', languages: ['ko'] })
    expect(m.translate).not.toHaveBeenCalled()
    expect(db.translations.size).toBe(0)
  })
})

async function readRow() {
  return db.prisma.appMessageImageText.findUnique({
    where: { messageId: 'msg-1' },
    select: { status: true, attemptCount: true, deadlineAt: true, blocks: true, translations: { select: { language: true, status: true, attemptCount: true, deadlineAt: true, texts: true } } },
  }) as unknown as Promise<Parameters<Service['mapConversationImageTextState']>[0]>
}

describe('read mapping', () => {
  const now = new Date('2026-09-30T09:00:00Z')
  const later = new Date(now.getTime() + 30_000)
  const earlier = new Date(now.getTime() - 1)
  const row = (overrides: Record<string, unknown> = {}) => ({ status: 'ready', attemptCount: 1, deadlineAt: earlier, blocks: japaneseSign, translations: [], ...overrides })

  it.each([
    ['no job yet', null, 'pending', true],
    ['queued', row({ status: 'queued', attemptCount: 0, blocks: null }), 'pending', true],
    ['running', row({ status: 'running', deadlineAt: later, blocks: null }), 'pending', false],
    ['stale under the limit', row({ status: 'running', blocks: null }), 'pending', true],
    ['stale at the limit', row({ status: 'running', attemptCount: 3, blocks: null }), 'failed', false],
    ['failed, cooling down', row({ status: 'failed', deadlineAt: later, blocks: null }), 'pending', false],
    ['failed, retryable', row({ status: 'failed', blocks: null }), 'pending', true],
    ['failed at the limit', row({ status: 'failed', attemptCount: 3, blocks: null }), 'failed', false],
    ['empty', row({ status: 'empty', blocks: [] }), 'empty', false],
    ['unknown status', row({ status: 'weird' }), 'failed', false],
  ])('maps %s', (_label, stored, status, runImageJob) => {
    const result = service.mapConversationImageTextState(stored, ['ko'], now)
    expect(result.response.status).toBe(status)
    expect(result.response.blocks).toEqual([])
    expect(result.runImageJob).toBe(runImageJob)
    expect(result.response.retryAfterMs).toBe(status === 'pending' ? 1500 : undefined)
  })

  it('returns blocks and one entry per requested language that has text to translate, in request order', () => {
    const result = service.mapConversationImageTextState(row({
      translations: [
        { language: 'ko', status: 'ready', attemptCount: 1, deadlineAt: earlier, texts: { b0: '영업시간', b1: 'CAFE MINGLE', b9: 'unknown block' } },
        { language: 'en', status: 'running', attemptCount: 1, deadlineAt: later, texts: null },
        { language: 'zh-TW', status: 'failed', attemptCount: 3, deadlineAt: earlier, texts: null },
      ],
    }), ['en', 'ko', 'zh-TW', 'zh-CN'], now)
    expect(result.response).toEqual({
      status: 'ready',
      blocks: japaneseSign,
      translations: [
        { language: 'en', status: 'pending', texts: {} },
        { language: 'ko', status: 'ready', texts: { b0: '영업시간', b1: 'CAFE MINGLE' } },
        { language: 'zh-TW', status: 'failed', texts: {} },
        { language: 'zh-CN', status: 'pending', texts: {} },
      ],
      retryAfterMs: 1500,
    })
    expect(result.translateLanguages).toEqual(['zh-CN'])
    expect(result.runImageJob).toBe(false)
  })

  it('omits languages whose blocks are all already in that language, and needs no polling when all are done', () => {
    const result = service.mapConversationImageTextState(row({
      blocks: [block('b0', '営業時間', 'ja')],
      translations: [{ language: 'ko', status: 'ready', attemptCount: 1, deadlineAt: earlier, texts: { b0: '영업시간' } }],
    }), ['ja', 'ko'], now)
    expect(result.response).toEqual({ status: 'ready', blocks: [block('b0', '営業時間', 'ja')], translations: [{ language: 'ko', status: 'ready', texts: { b0: '영업시간' } }] })
    expect(result.translateLanguages).toEqual([])
  })

  it('treats a ready row with unusable stored blocks as empty', () => {
    expect(service.mapConversationImageTextState(row({ blocks: [{ id: 'bad' }] }), ['ko'], now).response.status).toBe('empty')
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DurableFinalization } from './durable-message-finalization'

const { pendingRemoval } = vi.hoisted(() => ({ pendingRemoval: vi.fn(() => []) }))
vi.mock('../conversation-mutation-queue', () => ({ readConversationMutationRecords: pendingRemoval }))
type Module = typeof import('./durable-message-finalization')
const owner = 'user:one'
const namespace = 'ios/v2.0.1'
const journalKey = 'mingle:message-finalization:v1'
const cacheKey = 'mingle_demo_utterances__room-one'
const translated = { sourceLanguage: 'ko', translations: { en: 'Hello' }, model: 'test-model' }
const input = (id = 'message-one') => ({
  ownerIdentity: owner, apiNamespace: namespace, trackingUserId: 'tracking-one',
  conversationId: 'room-one', storageNamespace: 'room-one',
  eventBody: { eventType: 'stt_turn_finalized', sessionKey: 'session-one', clientMessageId: id, sourceText: '안녕하세요', sourceLanguage: 'ko' },
  translationBody: { text: '안녕하세요', sourceLanguage: 'ko', targetLanguages: ['ko', 'en'] },
  utterance: { id, originalText: '안녕하세요', originalLang: 'ko', translations: {}, targetLanguages: ['ko', 'en'] },
})
const bodyOf = (init?: RequestInit) => JSON.parse(String(init?.body || '{}'))

describe('durable message finalization', () => {
  let jobs: Module
  let localStorage: Storage
  let fetcher: ReturnType<typeof vi.fn<typeof fetch>>
  beforeEach(async () => {
    vi.useFakeTimers()
    pendingRemoval.mockReset().mockReturnValue([])
    const values = new Map<string, string>()
    localStorage = {
      get length() { return values.size },
      clear: () => values.clear(), getItem: key => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value) }, removeItem: key => { values.delete(key) },
      key: index => [...values.keys()][index] ?? null,
    }
    fetcher = vi.fn<typeof fetch>(async url => String(url).endsWith('translate/finalize')
      ? Response.json(translated) : new Response(null, { status: 204 }))
    vi.stubGlobal('window', { localStorage, fetch: fetcher })
    vi.resetModules()
    jobs = await import('./durable-message-finalization')
  })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

  it('writes the full original and translation intent synchronously before any request', () => {
    jobs.enqueueDurableFinalization(input())
    expect(fetcher).not.toHaveBeenCalled()
    expect(JSON.parse(localStorage.getItem(journalKey)!)[0]).toMatchObject({ sourceDelivered: false, translationBody: input().translationBody })
    expect(JSON.parse(localStorage.getItem(cacheKey)!)[0]).toMatchObject({ originalText: '안녕하세요', translationStatus: 'pending' })
  })

  it('acknowledges the source while translation hangs and retries after restart', async () => {
    fetcher.mockImplementation(async url => String(url).endsWith('translate/finalize')
      ? new Promise<Response>(() => {}) : new Response(null, { status: 204 }))
    const record = jobs.enqueueDurableFinalization(input())
    const delivery = jobs.deliverDurableFinalization(record)
    await vi.advanceTimersByTimeAsync(0)
    expect(JSON.parse(localStorage.getItem(journalKey)!)[0].sourceDelivered).toBe(true)
    jobs.cancelActiveDurableFinalizations(owner, namespace)
    await delivery
    vi.resetModules()
    jobs = await import('./durable-message-finalization')
    fetcher.mockReset().mockImplementation(async url => String(url).endsWith('translate/finalize')
      ? Response.json(translated) : new Response(null, { status: 204 }))
    await jobs.flushDurableFinalizations(owner, namespace, true)
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(bodyOf(fetcher.mock.calls[1][1])).toMatchObject({ clientMessageId: 'message-one', translations: translated.translations, translationUpdate: true })
    expect(localStorage.getItem(journalKey)).toBeNull()
    expect(JSON.parse(localStorage.getItem(cacheKey)!)[0]).toMatchObject({ translations: translated.translations, translationFinalized: { en: true } })
  })

  it('recovers from a crash between journal and warm-cache writes', () => {
    jobs.enqueueDurableFinalization(input())
    localStorage.removeItem(cacheKey)
    jobs.restoreDurableFinalizationCache(owner, namespace)
    expect(JSON.parse(localStorage.getItem(cacheKey)!)[0].originalText).toBe('안녕하세요')
  })

  it('retries both stages after offline failure and delivers exactly one logical message', async () => {
    fetcher.mockRejectedValue(new TypeError('offline'))
    const record = jobs.enqueueDurableFinalization(input())
    expect(await jobs.deliverDurableFinalization(record)).toBeNull()
    expect(jobs.readDurableFinalizations(owner, namespace)[0]).toMatchObject({ attemptCount: 1, sourceDelivered: false, result: null })
    expect(JSON.parse(localStorage.getItem(cacheKey)!)[0].translationStatus).toBe('retrying')
    fetcher.mockReset().mockImplementation(async url => String(url).endsWith('translate/finalize')
      ? Response.json(translated) : new Response(null, { status: 204 }))
    await jobs.flushDurableFinalizations(owner, namespace, true)
    const events = fetcher.mock.calls.filter(([url]) => String(url).endsWith('log/client-event')).map(([, init]) => bodyOf(init))
    expect(events).toHaveLength(2)
    expect(new Set(events.map(e => e.clientMessageId)).size).toBe(1)
    expect(events[0].translationPending).toBe(true)
    expect(events[1].translationUpdate).toBe(true)
    expect(jobs.readDurableFinalizations(owner, namespace)).toEqual([])
  })

  it('keeps completed translations when final acknowledgement fails, without calling AI again', async () => {
    fetcher.mockImplementation(async (url, init) => String(url).endsWith('translate/finalize')
      ? Response.json(translated) : new Response(null, { status: bodyOf(init).translationUpdate ? 503 : 204 }))
    await jobs.deliverDurableFinalization(jobs.enqueueDurableFinalization(input()))
    expect(jobs.readDurableFinalizations(owner, namespace)[0].result).toMatchObject(translated)
    vi.resetModules()
    jobs = await import('./durable-message-finalization')
    fetcher.mockClear().mockResolvedValue(new Response(null, { status: 204 }))
    await jobs.flushDurableFinalizations(owner, namespace, true)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(bodyOf(fetcher.mock.calls[0][1]).translations).toEqual(translated.translations)
  })

  it.each([{}, { translations: {} }, { translations: { en: '' } }, { translations: { en: 7 } }])('retries invalid or incomplete successful responses: %j', async value => {
    fetcher.mockImplementation(async url => String(url).endsWith('translate/finalize') ? Response.json(value) : new Response(null, { status: 204 }))
    await jobs.deliverDurableFinalization(jobs.enqueueDurableFinalization(input()))
    expect(jobs.readDurableFinalizations(owner, namespace)[0]).toMatchObject({ sourceDelivered: true, result: null, attemptCount: 1 })
  })

  it('accepts a detected source matching the sole target without fabricating a translation', () => {
    expect(jobs.parseFinalizationResult({ sourceLanguage: 'en', translations: {} }, { targetLanguages: ['en'] })).toMatchObject({ sourceLanguage: 'en', translations: {} })
  })

  it('times out a stalled response body, not only stalled response headers', async () => {
    fetcher.mockImplementation(async url => String(url).endsWith('translate/finalize')
      ? { ok: true, json: () => new Promise(() => {}) } as Response : new Response(null, { status: 204 }))
    const delivery = jobs.deliverDurableFinalization(jobs.enqueueDurableFinalization(input()))
    await vi.advanceTimersByTimeAsync(30_001)
    expect(await delivery).toBeNull()
    expect(jobs.readDurableFinalizations(owner, namespace)[0].attemptCount).toBe(1)
  })

  it('deduplicates overlapping flushes and direct delivery', async () => {
    const record = jobs.enqueueDurableFinalization(input())
    await Promise.all([jobs.flushDurableFinalizations(owner, namespace), jobs.flushDurableFinalizations(owner, namespace), jobs.deliverDurableFinalization(record)])
    expect(fetcher).toHaveBeenCalledTimes(3)
  })

  it('does not flush a different account or API namespace', async () => {
    jobs.enqueueDurableFinalization(input())
    await jobs.flushDurableFinalizations('user:two', namespace, true)
    await jobs.flushDurableFinalizations(owner, 'android/v2.0.1', true)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('keeps delivery alive when a room closes but the same-account list remains mounted', async () => {
    const releaseList = jobs.retainDurableFinalizationOwner(owner, namespace)
    const releaseRoom = jobs.retainDurableFinalizationOwner(owner, namespace)
    let resolve!: (response: Response) => void
    fetcher.mockImplementation(async url => String(url).endsWith('translate/finalize')
      ? new Promise<Response>(r => { resolve = r }) : new Response(null, { status: 204 }))
    const delivery = jobs.deliverDurableFinalization(jobs.enqueueDurableFinalization(input()))
    releaseRoom()
    resolve(Response.json(translated))
    expect(await delivery).toMatchObject(translated)
    expect(jobs.readDurableFinalizations(owner, namespace)).toEqual([])
    releaseList()
  })

  it('aborts old-account work after the last account consumer unmounts', async () => {
    const release = jobs.retainDurableFinalizationOwner(owner, namespace)
    fetcher.mockImplementation(async () => new Promise<Response>(() => {}))
    const delivery = jobs.deliverDurableFinalization(jobs.enqueueDurableFinalization(input()))
    release()
    expect(await delivery).toBeNull()
    expect(jobs.readDurableFinalizations(owner, namespace)[0].sourceDelivered).toBe(false)
  })

  it('adopts tracking jobs without losing completed source delivery', async () => {
    const record = jobs.enqueueDurableFinalization({ ...input(), ownerIdentity: 'tracking:tracking-one' })
    record.sourceDelivered = true
    await jobs.adoptDurableFinalizations('tracking:tracking-one', owner, namespace)
    expect(jobs.readDurableFinalizations('tracking:tracking-one', namespace)).toEqual([])
    await jobs.flushDurableFinalizations(owner, namespace, true)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('pauses tombstoned rooms and discards only confirmed deleted-room jobs', async () => {
    jobs.enqueueDurableFinalization(input())
    jobs.enqueueDurableFinalization({ ...input('message-two'), conversationId: 'room-two', storageNamespace: 'room-two' })
    pendingRemoval.mockReturnValue([{ conversationId: 'room-one', kind: 'remove' }] as never[])
    await jobs.flushDurableFinalizations(owner, namespace, true)
    expect(jobs.readDurableFinalizations(owner, namespace).map(r => r.conversationId)).toEqual(['room-one'])
    jobs.discardDurableFinalizations(owner, namespace, 'room-one')
    expect(jobs.readDurableFinalizations(owner, namespace)).toEqual([])
  })

  it('resumes delivery when a rejected removal drops its tombstone', async () => {
    jobs.enqueueDurableFinalization(input())
    pendingRemoval.mockReturnValue([{ conversationId: 'room-one', kind: 'remove' }] as never[])
    await jobs.flushDurableFinalizations(owner, namespace, true)
    expect(fetcher).not.toHaveBeenCalled()
    expect(jobs.readDurableFinalizations(owner, namespace)).toHaveLength(1)
    pendingRemoval.mockReturnValue([])
    await jobs.flushDurableFinalizations(owner, namespace, true)
    expect(jobs.readDurableFinalizations(owner, namespace)).toEqual([])
    expect(fetcher).toHaveBeenCalledTimes(3)
  })

  it('does not resurrect cache or send a translated update after an in-flight deletion', async () => {
    let resolve!: (value: Response) => void
    fetcher.mockImplementation(async url => String(url).endsWith('translate/finalize')
      ? new Promise<Response>(r => { resolve = r }) : new Response(null, { status: 204 }))
    const delivery = jobs.deliverDurableFinalization(jobs.enqueueDurableFinalization(input()))
    await vi.advanceTimersByTimeAsync(0)
    jobs.discardDurableFinalizations(owner, namespace, 'room-one')
    localStorage.removeItem(cacheKey)
    resolve(Response.json(translated))
    await delivery
    expect(localStorage.getItem(cacheKey)).toBeNull()
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('rejects corrupt journal entries but restores a valid neighboring message', async () => {
    const valid = jobs.enqueueDurableFinalization(input())
    localStorage.setItem(journalKey, JSON.stringify([null, { ...valid, apiNamespace: '../bad' }, { ...valid, id: 'bad', translationBody: [] }, valid]))
    vi.resetModules()
    jobs = await import('./durable-message-finalization')
    expect(jobs.readDurableFinalizations(owner, namespace).map((r: DurableFinalization) => r.id)).toEqual([valid.id])
  })
})

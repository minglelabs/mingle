import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DurableFinalization } from './durable-message-finalization'

const { pendingRemoval } = vi.hoisted(() => ({ pendingRemoval: vi.fn<(identity: unknown) => unknown[]>(() => []) }))
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
  let releaseOwner: () => void
  const releases: Array<() => void> = []
  const retainOwner = (ownerIdentity = owner, apiNamespace = namespace) => {
    const release = jobs.retainDurableFinalizationOwner(ownerIdentity, apiNamespace)
    releases.push(release)
    return release
  }
  const reloadJobs = async () => {
    for (const release of releases.splice(0)) release()
    vi.resetModules()
    jobs = await import('./durable-message-finalization')
    releaseOwner = retainOwner()
  }
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
    await reloadJobs()
  })
  afterEach(async () => {
    for (const release of releases.splice(0)) release()
    await vi.advanceTimersByTimeAsync(0)
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

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
    await reloadJobs()
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
    await reloadJobs()
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
    retainOwner('user:two')
    retainOwner(owner, 'android/v2.0.1')
    jobs.enqueueDurableFinalization(input())
    await jobs.flushDurableFinalizations('user:two', namespace, true)
    await jobs.flushDurableFinalizations(owner, 'android/v2.0.1', true)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it.each(['ios/v2.0.0', 'ios/v2.0.1', 'ios/v2.0.2'])('recovers %s jobs after a cold upgrade to iOS 2.0.3', async previousNamespace => {
    jobs.enqueueDurableFinalization({ ...input(), apiNamespace: previousNamespace })
    await reloadJobs()
    retainOwner(owner, 'ios/v2.0.3')
    await jobs.flushDurableFinalizations(owner, 'ios/v2.0.3', true)
    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(fetcher.mock.calls.every(([url]) => String(url).startsWith('/api/ios/v2.0.3/'))).toBe(true)
    expect(fetcher.mock.calls.every(([, init]) => new Headers(init?.headers).get('x-mingle-expected-account-id') === 'one')).toBe(true)
    expect(bodyOf(fetcher.mock.calls[0][1]).clientMessageId).toBe('message-one')
    expect(localStorage.getItem(journalKey)).toBeNull()
  })

  it('preserves completed translation and source progress across an Android update', async () => {
    fetcher.mockImplementation(async (url, init) => String(url).endsWith('translate/finalize')
      ? Response.json(translated) : new Response(null, { status: bodyOf(init).translationUpdate ? 503 : 204 }))
    retainOwner(owner, 'android/v2.0.0')
    await jobs.deliverDurableFinalization(jobs.enqueueDurableFinalization({ ...input(), apiNamespace: 'android/v2.0.0' }))
    await reloadJobs()
    retainOwner(owner, 'android/v2.0.1')
    fetcher.mockReset().mockResolvedValue(new Response(null, { status: 204 }))
    await jobs.flushDurableFinalizations(owner, 'android/v2.0.1', true)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls[0][0]).toBe('/api/android/v2.0.1/log/client-event')
    expect(bodyOf(fetcher.mock.calls[0][1])).toMatchObject({ translationUpdate: true, translations: translated.translations })
    expect(localStorage.getItem(journalKey)).toBeNull()
  })

  it('never adopts another account, platform, legacy, unknown, or tracking-only job during upgrade', async () => {
    for (const [ownerIdentity, apiNamespace] of [
      ['user:two', 'ios/v2.0.0'], [owner, 'android/v2.0.0'], [owner, 'ios/v1.1.4'],
      [owner, 'ios/v2.1.0'], ['tracking:tracking-one', 'ios/v2.0.0'],
    ]) jobs.enqueueDurableFinalization({ ...input(), ownerIdentity, apiNamespace })
    await reloadJobs()
    retainOwner(owner, 'ios/v2.0.3')
    await jobs.flushDurableFinalizations(owner, 'ios/v2.0.3', true)
    expect(fetcher).not.toHaveBeenCalled()
    expect(JSON.parse(localStorage.getItem(journalKey)!)).toHaveLength(5)
  })

  it('retains migrated work after 401 and resumes when the original account returns', async () => {
    jobs.enqueueDurableFinalization({ ...input(), apiNamespace: 'ios/v2.0.0', translationBody: null })
    retainOwner(owner, 'ios/v2.0.3')
    fetcher.mockResolvedValue(new Response(null, { status: 401 }))
    await jobs.flushDurableFinalizations(owner, 'ios/v2.0.3', true)
    expect(jobs.readDurableFinalizations(owner, 'ios/v2.0.3')).toHaveLength(1)
    await reloadJobs()
    retainOwner(owner, 'ios/v2.0.3')
    fetcher.mockReset().mockResolvedValue(new Response(null, { status: 204 }))
    await jobs.flushDurableFinalizations(owner, 'ios/v2.0.3', true)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem(journalKey)).toBeNull()
  })

  it('cancels an upgrade before migration if the account unmounts', async () => {
    jobs.enqueueDurableFinalization({ ...input(), apiNamespace: 'ios/v2.0.0' })
    const release = retainOwner(owner, 'ios/v2.0.3')
    const flushing = jobs.flushDurableFinalizations(owner, 'ios/v2.0.3', true)
    release()
    await flushing
    expect(fetcher).not.toHaveBeenCalled()
    expect(jobs.readDurableFinalizations(owner, 'ios/v2.0.0')).toHaveLength(1)
  })

  it('discards deleted-room jobs across compatible versions before recovery starts', async () => {
    jobs.enqueueDurableFinalization({ ...input(), apiNamespace: 'ios/v2.0.0' })
    jobs.discardDurableFinalizations(owner, 'ios/v2.0.3', 'room-one')
    expect(localStorage.getItem(journalKey)).toBeNull()
  })

  it('migrates a real removal queue with its message and keeps the message paused until removal acknowledgement', async () => {
    const mutations = await vi.importActual<typeof import('../conversation-mutation-queue')>('../conversation-mutation-queue')
    const previous = { authenticatedUserId: 'one', apiNamespace: 'ios/v2.0.0' }
    const upgraded = { ...previous, apiNamespace: 'ios/v2.0.3' }
    mutations.enqueueConversationMutation(previous, {
      conversationId: 'room-one', kind: 'remove', endpoint: '/api/ios/v2.0.0/conversations/room-one',
      method: 'DELETE', body: {}, patch: { removed: true },
    })
    pendingRemoval.mockImplementation(identity => mutations.readConversationMutationRecords(identity as typeof upgraded))
    jobs.enqueueDurableFinalization({ ...input(), apiNamespace: previous.apiNamespace })
    retainOwner(owner, upgraded.apiNamespace)
    await jobs.flushDurableFinalizations(owner, upgraded.apiNamespace, true)
    expect(fetcher).not.toHaveBeenCalled()
    expect(jobs.readDurableFinalizations(owner, upgraded.apiNamespace)).toHaveLength(1)
    await mutations.flushConversationMutationQueue({ identity: upgraded, fetchImpl: fetcher,
      onSuccess: () => jobs.discardDurableFinalizations(owner, upgraded.apiNamespace, 'room-one'),
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls[0][1]?.method).toBe('DELETE')
    expect(fetcher.mock.calls[0][0]).toBe('/api/ios/v2.0.3/conversations/room-one')
    expect(localStorage.getItem(journalKey)).toBeNull()
  })

  it('keeps delivery alive when a room closes but the same-account list remains mounted', async () => {
    const releaseList = releaseOwner
    const releaseRoom = retainOwner()
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
    const release = releaseOwner
    fetcher.mockImplementation(async () => new Promise<Response>(() => {}))
    const delivery = jobs.deliverDurableFinalization(jobs.enqueueDurableFinalization(input()))
    release()
    expect(await delivery).toBeNull()
    expect(jobs.readDurableFinalizations(owner, namespace)[0].sourceDelivered).toBe(false)
  })

  it.each([true, false])('stops the entire old-account batch, including queued messages (translation=%s)', async translate => {
    const release = releaseOwner
    for (const id of ['message-one', 'message-two', 'message-three']) {
      jobs.enqueueDurableFinalization({ ...input(id), translationBody: translate ? input().translationBody : null })
    }
    fetcher.mockImplementation(async () => new Promise<Response>(() => {}))
    const flushing = jobs.flushDurableFinalizations(owner, namespace, true)
    await vi.advanceTimersByTimeAsync(0)
    expect(fetcher).toHaveBeenCalledTimes(translate ? 4 : 2)
    release()
    fetcher.mockImplementation(async url => String(url).endsWith('translate/finalize')
      ? Response.json(translated) : new Response(null, { status: 204 }))
    await flushing
    expect(fetcher).toHaveBeenCalledTimes(translate ? 4 : 2)
    expect(jobs.readDurableFinalizations(owner, namespace)).toHaveLength(3)
    expect(jobs.readDurableFinalizations(owner, namespace).every(r => !r.sourceDelivered && !r.result)).toBe(true)
  })

  it('blocks stale flush and direct delivery calls until the original account returns', async () => {
    const release = releaseOwner
    const record = jobs.enqueueDurableFinalization(input())
    release()
    const releaseOther = retainOwner('user:two')
    await jobs.flushDurableFinalizations(owner, namespace, true)
    expect(await jobs.deliverDurableFinalization(record)).toBeNull()
    expect(fetcher).not.toHaveBeenCalled()
    expect(jobs.readDurableFinalizations(owner, namespace)).toHaveLength(1)

    const other = jobs.enqueueDurableFinalization({ ...input('other-message'), ownerIdentity: 'user:two' })
    await jobs.deliverDurableFinalization(other)
    expect(jobs.readDurableFinalizations('user:two', namespace)).toEqual([])
    releaseOther()
    const releaseAgain = retainOwner()
    await jobs.flushDurableFinalizations(owner, namespace, true)
    expect(jobs.readDurableFinalizations(owner, namespace)).toEqual([])
    expect(fetcher.mock.calls.filter(([, init]) => bodyOf(init).clientMessageId === 'message-one')).toHaveLength(2)
    releaseAgain()
  })

  it.each([
    { otherOwner: 'user:two', otherNamespace: namespace },
    { otherOwner: owner, otherNamespace: 'android/v2.0.1' },
  ])('does not cancel another retained account/API scope: %j', async ({ otherOwner, otherNamespace }) => {
    retainOwner(otherOwner, otherNamespace)
    let finishOther!: (response: Response) => void
    fetcher.mockImplementation(async (url, init) => {
      if (!String(url).endsWith('translate/finalize')) return new Response(null, { status: 204 })
      if (bodyOf(init).clientMessageId === 'other-message') {
        return new Promise<Response>(resolve => { finishOther = resolve })
      }
      return new Promise<Response>(() => {})
    })
    const original = jobs.deliverDurableFinalization(jobs.enqueueDurableFinalization(input()))
    const other = jobs.deliverDurableFinalization(jobs.enqueueDurableFinalization({
      ...input('other-message'), ownerIdentity: otherOwner, apiNamespace: otherNamespace,
      translationBody: { ...input().translationBody, clientMessageId: 'other-message' },
    }))
    releaseOwner()
    finishOther(Response.json(translated))
    expect(await original).toBeNull()
    expect(await other).toMatchObject(translated)
    expect(jobs.readDurableFinalizations(owner, namespace)).toHaveLength(1)
    expect(jobs.readDurableFinalizations(otherOwner, otherNamespace)).toEqual([])
  })

  it('cancels a batch explicitly without losing its queued jobs or blocking a later retry', async () => {
    const release = releaseOwner
    for (const id of ['message-one', 'message-two', 'message-three']) jobs.enqueueDurableFinalization(input(id))
    fetcher.mockImplementation(async () => new Promise<Response>(() => {}))
    const flushing = jobs.flushDurableFinalizations(owner, namespace, true)
    await vi.advanceTimersByTimeAsync(0)
    jobs.cancelActiveDurableFinalizations(owner, namespace)
    fetcher.mockImplementation(async url => String(url).endsWith('translate/finalize')
      ? Response.json(translated) : new Response(null, { status: 204 }))
    await flushing
    expect(fetcher).toHaveBeenCalledTimes(4)
    expect(jobs.readDurableFinalizations(owner, namespace)).toHaveLength(3)
    await jobs.flushDurableFinalizations(owner, namespace, true)
    expect(jobs.readDurableFinalizations(owner, namespace)).toEqual([])
    release()
  })

  it('resumes on immediate same-account remount without reusing or deleting the old flush', async () => {
    const release = releaseOwner
    for (const id of ['message-one', 'message-two', 'message-three']) jobs.enqueueDurableFinalization(input(id))
    fetcher.mockImplementation(async () => new Promise<Response>(() => {}))
    const oldFlush = jobs.flushDurableFinalizations(owner, namespace, true)
    release()
    const releaseAgain = retainOwner()
    let finishLastSource!: (response: Response) => void
    fetcher.mockImplementation(async (url, init) => {
      if (String(url).endsWith('translate/finalize')) return Response.json(translated)
      if (bodyOf(init).clientMessageId === 'message-three' && !bodyOf(init).translationUpdate) {
        return new Promise<Response>(resolve => { finishLastSource = resolve })
      }
      return new Response(null, { status: 204 })
    })
    const newFlush = jobs.flushDurableFinalizations(owner, namespace, true)
    expect(newFlush).not.toBe(oldFlush)
    await oldFlush
    await vi.advanceTimersByTimeAsync(0)
    expect(jobs.flushDurableFinalizations(owner, namespace, true)).toBe(newFlush)
    finishLastSource(new Response(null, { status: 204 }))
    await newFlush
    expect(jobs.readDurableFinalizations(owner, namespace)).toEqual([])
    const updates = fetcher.mock.calls.map(([, init]) => bodyOf(init)).filter(body => body.translationUpdate)
    expect(updates.map(body => body.clientMessageId).sort()).toEqual(['message-one', 'message-three', 'message-two'])
    releaseAgain()
  })

  it('does not release another mounted consumer when one cleanup is called twice', async () => {
    const releaseList = releaseOwner
    const releaseRoom = retainOwner()
    let finish!: (response: Response) => void
    fetcher.mockImplementation(async url => String(url).endsWith('translate/finalize')
      ? new Promise<Response>(resolve => { finish = resolve }) : new Response(null, { status: 204 }))
    const delivery = jobs.deliverDurableFinalization(jobs.enqueueDurableFinalization(input()))
    releaseRoom()
    releaseRoom()
    finish(Response.json(translated))
    expect(await delivery).toMatchObject(translated)
    releaseList()
  })

  it.each(['release', 'cancel'])('does not revive a deferred replacement delivery after owner %s', async action => {
    fetcher.mockImplementation(async () => new Promise<Response>(() => {}))
    const original = jobs.deliverDurableFinalization(jobs.enqueueDurableFinalization(input()))
    const replacement = jobs.enqueueDurableFinalization({
      ...input(), utterance: { ...input().utterance, originalText: 'Updated' },
    })
    const deferred = jobs.deliverDurableFinalization(replacement)
    if (action === 'release') {
      releaseOwner()
      retainOwner()
    } else {
      jobs.cancelActiveDurableFinalizations(owner, namespace)
    }
    fetcher.mockImplementation(async url => String(url).endsWith('translate/finalize')
      ? Response.json(translated) : new Response(null, { status: 204 }))
    await original
    expect(await deferred).toBeNull()
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(jobs.readDurableFinalizations(owner, namespace)).toHaveLength(1)
    await jobs.flushDurableFinalizations(owner, namespace, true)
    expect(jobs.readDurableFinalizations(owner, namespace)).toEqual([])
  })

  it('stops the tracking-owner batch before adopting all pending jobs', async () => {
    const fromOwner = 'tracking:tracking-one'
    const releaseTracking = retainOwner(fromOwner)
    const releaseAccount = releaseOwner
    for (const id of ['message-one', 'message-two', 'message-three']) {
      jobs.enqueueDurableFinalization({ ...input(id), ownerIdentity: fromOwner })
    }
    fetcher.mockImplementation(async () => new Promise<Response>(() => {}))
    const oldFlush = jobs.flushDurableFinalizations(fromOwner, namespace, true)
    await vi.advanceTimersByTimeAsync(0)
    fetcher.mockImplementation(async url => String(url).endsWith('translate/finalize')
      ? Response.json(translated) : new Response(null, { status: 204 }))
    await jobs.adoptDurableFinalizations(fromOwner, owner, namespace)
    await oldFlush
    expect(fetcher).toHaveBeenCalledTimes(4)
    expect(jobs.readDurableFinalizations(fromOwner, namespace)).toEqual([])
    expect(jobs.readDurableFinalizations(owner, namespace)).toHaveLength(3)
    await jobs.flushDurableFinalizations(owner, namespace, true)
    expect(jobs.readDurableFinalizations(owner, namespace)).toEqual([])
    releaseTracking()
    releaseAccount()
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
    await reloadJobs()
    expect(jobs.readDurableFinalizations(owner, namespace).map((r: DurableFinalization) => r.id)).toEqual([valid.id])
  })
})

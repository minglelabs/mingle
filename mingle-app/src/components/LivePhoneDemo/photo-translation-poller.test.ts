import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CONVERSATION_IMAGE_TEXT_JOB_DEADLINE_MS, CONVERSATION_IMAGE_TEXT_MAX_POLL_MS, CONVERSATION_IMAGE_TEXT_POLL_MS, type ConversationImageTextResponse } from '@/lib/conversation-image-text'
import { EXPECTED_ACCOUNT_HEADER } from '@/lib/request-account-guard'
import { PHOTO_TRANSLATION_REQUEST_TIMEOUT_MS, startPhotoTranslationPoller } from './photo-translation-fetch.logic'
import { PHOTO_TRANSLATION_READY_BODY, photoTranslationPendingResponse, photoTranslationSettledResponse } from './photo-translation.fixtures'

const PENDING_BODY = { status: 'pending', blocks: [], translations: [], retryAfterMs: 2000 }
const SETTLED_BODY = JSON.parse(JSON.stringify(photoTranslationSettledResponse))

function reply(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) } as Response
}

function fetchQueue(...answers: Array<unknown | { status: number; body?: unknown }>) {
  const inits: RequestInit[] = []
  const fetchImpl = vi.fn(async (_input: string, init: RequestInit) => {
    inits.push(init)
    const next = answers.length > 1 ? answers.shift() : answers[0]
    if (next && typeof next === 'object' && 'status' in next && typeof (next as { status: unknown }).status === 'number') {
      const { status, body } = next as { status: number; body?: unknown }
      return reply(body ?? {}, status)
    }
    return reply(next)
  })
  return { fetchImpl, inits }
}

function start(options: Partial<Parameters<typeof startPhotoTranslationPoller>[0]> & Pick<Parameters<typeof startPhotoTranslationPoller>[0], 'fetchImpl'>) {
  const seen: ConversationImageTextResponse[] = []
  const poller = startPhotoTranslationPoller({
    endpoint: '/api/ios/v2.1.0/conversations/c1/images/m1/text?languages=ko,en,ja',
    viewerUserId: 'user-1',
    languages: ['ko', 'en', 'ja'],
    onResponse: response => seen.push(response),
    ...options,
  })
  return { poller, seen }
}

describe('startPhotoTranslationPoller', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('asks once on open with no-store, the account header and a signal', async () => {
    const { fetchImpl, inits } = fetchQueue(SETTLED_BODY)
    const { poller, seen } = start({ fetchImpl })
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl.mock.calls[0][0]).toBe('/api/ios/v2.1.0/conversations/c1/images/m1/text?languages=ko,en,ja')
    expect(inits[0]).toMatchObject({ cache: 'no-store', headers: { [EXPECTED_ACCOUNT_HEADER]: 'user-1' } })
    expect(inits[0].signal).toBeInstanceOf(AbortSignal)
    expect(seen).toEqual([photoTranslationSettledResponse])
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    poller.stop()
  })

  it('polls at the server retryAfterMs while anything is pending, then stops', async () => {
    const { fetchImpl } = fetchQueue(PENDING_BODY, PENDING_BODY, PHOTO_TRANSLATION_READY_BODY, SETTLED_BODY)
    const { poller, seen } = start({ fetchImpl })
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(1999)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(2000)
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(1200)
    expect(fetchImpl).toHaveBeenCalledTimes(4)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetchImpl).toHaveBeenCalledTimes(4)
    // An unchanged pending answer is not reported twice.
    expect(seen.map(response => response.status)).toEqual(['pending', 'ready', 'ready'])
    poller.stop()
  })

  it('ends the spinner at the polling budget and lets reopening retry the local failure', async () => {
    const { fetchImpl } = fetchQueue(PENDING_BODY)
    const { poller, seen } = start({ fetchImpl })
    await vi.advanceTimersByTimeAsync(CONVERSATION_IMAGE_TEXT_MAX_POLL_MS + 2_000)
    expect(fetchImpl).toHaveBeenCalledTimes(CONVERSATION_IMAGE_TEXT_MAX_POLL_MS / 2_000 + 1)
    expect(seen.at(-1)).toEqual({ status: 'failed', blocks: [], translations: [] })
    poller.stop()

    const retry = fetchQueue(SETTLED_BODY)
    const reopened = start({ fetchImpl: retry.fetchImpl, cached: seen.at(-1) })
    await vi.advanceTimersByTimeAsync(0)
    expect(retry.fetchImpl).toHaveBeenCalledTimes(1)
    expect(reopened.seen).toEqual([photoTranslationSettledResponse])
    reopened.poller.stop()
  })

  it('continues past 45 seconds for an abandoned claim to expire and recover', async () => {
    vi.setSystemTime(0)
    const fetchImpl = vi.fn(async () => Date.now() >= CONVERSATION_IMAGE_TEXT_JOB_DEADLINE_MS + 42_000 + 18_000
      ? reply(SETTLED_BODY)
      : reply(PENDING_BODY))
    const { poller, seen } = start({ fetchImpl })
    await vi.advanceTimersByTimeAsync(45_000)
    expect(fetchImpl).toHaveBeenCalledTimes(23)
    expect(seen.at(-1)).toMatchObject({ status: 'pending' })
    await vi.advanceTimersByTimeAsync(120_000)
    expect(fetchImpl.mock.calls.length).toBeGreaterThan(23)
    expect(seen.at(-1)).toEqual(photoTranslationSettledResponse)
    poller.stop()
  })

  it('makes no request when the cached answer is final', async () => {
    const { fetchImpl } = fetchQueue(SETTLED_BODY)
    const { poller } = start({ fetchImpl, cached: photoTranslationSettledResponse })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(fetchImpl).not.toHaveBeenCalled()
    poller.stop()
  })

  it('holds polls while the document is hidden and resumes on visibility', async () => {
    let hidden = false
    const { fetchImpl } = fetchQueue(PENDING_BODY)
    const { poller } = start({ fetchImpl, isHidden: () => hidden })
    await vi.advanceTimersByTimeAsync(0)
    hidden = true
    await vi.advanceTimersByTimeAsync(10_000)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    poller.resume()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    hidden = false
    poller.resume()
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    poller.stop()
  })

  it('aborts the request in flight on close and drops its late answer', async () => {
    let finish: () => void = () => {}
    let signal: AbortSignal | null | undefined
    const fetchImpl = vi.fn((_input: string, init: RequestInit) => new Promise<Response>(resolve => {
      signal = init.signal
      finish = () => resolve(reply(SETTLED_BODY))
    }))
    const { poller, seen } = start({ fetchImpl })
    await vi.advanceTimersByTimeAsync(0)
    poller.stop()
    expect(signal?.aborted).toBe(true)
    finish()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(seen).toEqual([])
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('retries network and server errors with backoff but not client errors', async () => {
    const { fetchImpl } = fetchQueue({ status: 503 }, { status: 503 }, SETTLED_BODY)
    const { poller, seen } = start({ fetchImpl })
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(CONVERSATION_IMAGE_TEXT_POLL_MS)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(CONVERSATION_IMAGE_TEXT_POLL_MS * 2)
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(seen).toHaveLength(1)
    poller.stop()

    const missing = fetchQueue({ status: 404 })
    const second = start({ fetchImpl: missing.fetchImpl })
    await vi.advanceTimersByTimeAsync(30_000)
    expect(missing.fetchImpl).toHaveBeenCalledTimes(1)
    expect(second.seen).toEqual([])
    second.poller.stop()
  })

  it('ends pending UI state after repeated network errors', async () => {
    const { fetchImpl } = fetchQueue({ status: 503 }, { status: 503 }, { status: 503 })
    const { poller, seen } = start({ fetchImpl, cached: photoTranslationPendingResponse })
    await vi.advanceTimersByTimeAsync(CONVERSATION_IMAGE_TEXT_POLL_MS * 3)
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(seen).toEqual([{ status: 'failed', blocks: [], translations: [] }])
    poller.stop()
  })

  it('treats an unparsable body as a failure', async () => {
    const { fetchImpl } = fetchQueue({ status: 'weird' }, SETTLED_BODY)
    const { poller, seen } = start({ fetchImpl })
    await vi.advanceTimersByTimeAsync(0)
    expect(seen).toEqual([])
    await vi.advanceTimersByTimeAsync(CONVERSATION_IMAGE_TEXT_POLL_MS)
    expect(seen).toEqual([photoTranslationSettledResponse])
    poller.stop()
  })

  it('aborts a request that outlives its deadline and retries', async () => {
    const fetchImpl = vi.fn((_input: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new Error('aborted')))
    }))
    const { poller } = start({ fetchImpl })
    await vi.advanceTimersByTimeAsync(PHOTO_TRANSLATION_REQUEST_TIMEOUT_MS - 1)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1 + CONVERSATION_IMAGE_TEXT_POLL_MS)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    poller.stop()
  })
})

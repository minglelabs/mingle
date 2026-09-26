import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __resetPublishStoreForTest,
  clearPublishJob,
  getPublishJob,
  onPublishSuccess,
  publishFailureReason,
  isPublishRunning,
  retryPublish,
  startPublish,
  type PublishInput,
} from './publish-store'
import { __setFeedEventSinkForTest, FEED_EVENTS, type FeedAnalyticsEvent } from '@/lib/feed-analytics'

function jsonResponse(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function baseInput(overrides: Partial<PublishInput> = {}): PublishInput {
  return {
    clientPostId: 'client-post-000000000001',
    sourceText: 'hello world',
    sourceLanguage: 'en',
    backgroundKey: 'warm-cream',
    imageObjectKey: null,
    imageFile: null,
    imageWidth: null,
    imageHeight: null,
    draftId: null,
    ...overrides,
  }
}

/** "METHOD /path" of a fetch call, without the API namespace prefix or query. */
function callKey(call: unknown[]): string {
  const url = String(call[0])
  const method = ((call[1] as RequestInit | undefined)?.method ?? 'GET').toUpperCase()
  const path = url.split('?')[0].replace(/^.*?\/api(?:\/(?:ios|android|web)\/v[\d.]+)?/, '')
  return `${method} ${path}`
}

/** A fake API: each "METHOD /path" answers from its handler; anything else 404s. */
function routeFetch(routes: Record<string, (init: RequestInit | undefined) => Response>) {
  const fetchMock = vi.fn(async (...args: unknown[]) => {
    const handler = routes[callKey(args)]
    return handler ? handler(args[1] as RequestInit | undefined) : jsonResponse({ error: 'not_found' }, 404)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function bodyOf(call: unknown[]): Record<string, unknown> {
  return JSON.parse(String((call[1] as RequestInit).body))
}

// Drain the microtask queue so the async pipeline settles.
async function flush() {
  await new Promise((r) => setTimeout(r, 0))
  await new Promise((r) => setTimeout(r, 0))
}

describe('publish store', () => {
  beforeEach(() => {
    __resetPublishStoreForTest()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    __resetPublishStoreForTest()
  })

  it('publishes a text-only post and reaches success with the postId', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ postId: 'post-1' }, 201))
    vi.stubGlobal('fetch', fetchMock)

    startPublish(baseInput())
    expect(getPublishJob()?.status).toBe('publishing')
    expect(getPublishJob()?.running).toBe(true)
    await flush()

    const job = getPublishJob()
    expect(job?.status).toBe('success')
    expect(job?.postId).toBe('post-1')
    expect(job?.running).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('uploads the image first and creates the post with its server-issued key', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ imageObjectKey: 'post-images/u1/k.jpg', width: 100, height: 80 }, 201))
      .mockResolvedValueOnce(jsonResponse({ postId: 'post-2' }, 201))
    vi.stubGlobal('fetch', fetchMock)

    startPublish(baseInput({ imageFile: new File(['x'], 'p.jpg', { type: 'image/jpeg' }), imageWidth: 100, imageHeight: 80 }))
    await flush()

    expect(getPublishJob()?.status).toBe('success')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][0] as string).toMatch(/\/posts\/images$/)
    const createBody = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string)
    expect(createBody.imageObjectKey).toBe('post-images/u1/k.jpg')
  })

  it('publishes an image-only post: the create carries the image key, not an empty body', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ imageObjectKey: 'post-images/u1/only.jpg', width: 10, height: 10 }, 201))
      .mockResolvedValueOnce(jsonResponse({ postId: 'post-img' }, 201))
    vi.stubGlobal('fetch', fetchMock)

    startPublish(baseInput({ sourceText: null, imageFile: new File(['x'], 'p.jpg', { type: 'image/jpeg' }) }))
    await flush()

    expect(getPublishJob()?.status).toBe('success')
    const createBody = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string)
    expect(createBody).toMatchObject({ sourceText: null, imageObjectKey: 'post-images/u1/only.jpg' })
  })

  it('reuses an already-uploaded draft image key without re-uploading', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ postId: 'post-d' }, 201))
    vi.stubGlobal('fetch', fetchMock)

    startPublish(baseInput({ sourceText: null, imageObjectKey: 'post-images/u1/draft.jpg' }))
    await flush()

    expect(getPublishJob()?.status).toBe('success')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const createBody = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(createBody.imageObjectKey).toBe('post-images/u1/draft.jpg')
  })

  it('marks failed and surfaces retryAfterSeconds on a 429 create', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: 'rate_limited', retryAfterSeconds: 30 }, 429))
    vi.stubGlobal('fetch', fetchMock)

    startPublish(baseInput())
    await flush()

    const job = getPublishJob()
    expect(job?.status).toBe('failed')
    expect(job?.retryAfterSeconds).toBe(30)
    expect(job?.postId).toBeNull()
  })

  it('does not create the post when the image upload fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'image_upload_failed' }, 503))
    vi.stubGlobal('fetch', fetchMock)

    startPublish(baseInput({ imageFile: new File(['x'], 'p.jpg', { type: 'image/jpeg' }) }))
    await flush()

    const job = getPublishJob()
    expect(job?.status).toBe('failed')
    expect(job?.postId).toBeNull()
    expect(fetchMock.mock.calls.filter((c) => callKey(c) === 'POST /posts')).toHaveLength(0)
  })

  it('keeps the uploaded key when the create fails so a retry does not re-upload', async () => {
    const creates = [jsonResponse({ error: 'request_failed' }, 500), jsonResponse({ postId: 'post-3' }, 201)]
    const fetchMock = routeFetch({
      'POST /posts/images': () => jsonResponse({ imageObjectKey: 'post-images/u1/r.jpg' }, 201),
      'POST /posts': () => creates.shift()!,
      'POST /posts/drafts': () => jsonResponse({ draft: { id: 'draft-kept' } }, 201),
      'DELETE /posts/drafts': () => jsonResponse({ deleted: true }),
    })

    startPublish(baseInput({ imageFile: new File(['x'], 'p.jpg', { type: 'image/jpeg' }) }))
    await flush()
    expect(getPublishJob()?.status).toBe('failed')
    expect(getPublishJob()?.input.imageObjectKey).toBe('post-images/u1/r.jpg')

    retryPublish()
    await flush()
    expect(getPublishJob()?.status).toBe('success')
    const uploads = fetchMock.mock.calls.filter((c) => callKey(c) === 'POST /posts/images')
    expect(uploads).toHaveLength(1)
  })

  it('refuses a second startPublish while one is running (no duplicate create, caller told)', async () => {
    let resolveCreate: (r: Response) => void = () => {}
    const fetchMock = vi.fn().mockImplementation(
      () => new Promise<Response>((resolve) => { resolveCreate = resolve }),
    )
    vi.stubGlobal('fetch', fetchMock)

    expect(startPublish(baseInput())).toBe(true)
    expect(isPublishRunning()).toBe(true)
    // A different post while the first runs is refused, not silently dropped:
    // the caller gets false and keeps that post on screen / as a draft.
    expect(startPublish(baseInput({ clientPostId: 'client-post-000000000002', sourceText: 'second' }))).toBe(false)
    expect(getPublishJob()?.input.clientPostId).toBe('client-post-000000000001')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    resolveCreate(jsonResponse({ postId: 'post-4' }, 201))
    await flush()
    expect(getPublishJob()?.status).toBe('success')
  })

  it('retry reuses the same clientPostId', async () => {
    const creates = [jsonResponse({ error: 'request_failed' }, 500), jsonResponse({ postId: 'post-5', duplicate: true }, 200)]
    const fetchMock = routeFetch({
      'POST /posts': () => creates.shift()!,
      'POST /posts/drafts': () => jsonResponse({ error: 'offline' }, 503),
    })

    startPublish(baseInput({ clientPostId: 'reuse-me-000000000001' }))
    await flush()
    expect(getPublishJob()?.status).toBe('failed')

    retryPublish()
    await flush()
    expect(getPublishJob()?.status).toBe('success')

    const createCalls = fetchMock.mock.calls.filter((c) => callKey(c) === 'POST /posts')
    const firstBody = JSON.parse((createCalls[0][1] as RequestInit).body as string)
    const secondBody = JSON.parse((createCalls[1][1] as RequestInit).body as string)
    expect(firstBody.clientPostId).toBe('reuse-me-000000000001')
    expect(secondBody.clientPostId).toBe('reuse-me-000000000001')
  })

  it('deletes only the given draft on success and fires onPublishSuccess', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ postId: 'post-6' }, 201))
      .mockResolvedValueOnce(jsonResponse({ deleted: true }, 200))
    vi.stubGlobal('fetch', fetchMock)

    const seen: Array<{ postId: string; draftId: string | null }> = []
    onPublishSuccess((r) => seen.push(r))

    startPublish(baseInput({ draftId: 'draft-9' }))
    await flush()

    expect(getPublishJob()?.status).toBe('success')
    expect(seen).toEqual([{ postId: 'post-6', draftId: 'draft-9' }])
    const deleteCall = fetchMock.mock.calls.find((c) => (c[1] as RequestInit)?.method === 'DELETE')
    expect(deleteCall?.[0]).toContain('draftId=draft-9')
  })

  it('does not clear a running job but clears a settled one', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ postId: 'post-7' }, 201))
    vi.stubGlobal('fetch', fetchMock)

    startPublish(baseInput())
    clearPublishJob() // running — ignored
    expect(getPublishJob()).not.toBeNull()
    await flush()
    clearPublishJob() // settled — cleared
    expect(getPublishJob()).toBeNull()
  })

  it('sends the previewed background key and the image size with the create', async () => {
    const fetchMock = routeFetch({
      'POST /posts/images': () => jsonResponse({ imageObjectKey: 'post-images/u1/k.jpg', width: 1536, height: 2048 }, 201),
      'POST /posts': () => jsonResponse({ postId: 'post-bg' }, 201),
    })
    startPublish(baseInput({ backgroundKey: 'dark-mesh', imageFile: new File(['x'], 'p.jpg', { type: 'image/jpeg' }) }))
    await flush()
    const create = fetchMock.mock.calls.find((c) => callKey(c) === 'POST /posts')!
    expect(bodyOf(create)).toMatchObject({
      backgroundKey: 'dark-mesh',
      imageObjectKey: 'post-images/u1/k.jpg',
      imageWidth: 1536,
      imageHeight: 2048,
    })
  })

  it('saves a failed post as a new draft, so dismissing the banner loses nothing', async () => {
    const fetchMock = routeFetch({
      'POST /posts': () => jsonResponse({ error: 'request_failed' }, 500),
      'POST /posts/drafts': () => jsonResponse({ draft: { id: 'draft-new' } }, 201),
    })
    startPublish(baseInput({ sourceText: 'keep me', backgroundKey: 'dark-mesh' }))
    await flush()
    const job = getPublishJob()
    expect(job?.status).toBe('failed')
    expect(job?.savedAsDraft).toBe(true)
    expect(job?.input.draftId).toBe('draft-new')
    const draftCall = fetchMock.mock.calls.find((c) => callKey(c) === 'POST /posts/drafts')!
    expect(bodyOf(draftCall)).toMatchObject({ sourceText: 'keep me', backgroundKey: 'dark-mesh' })
    // Dismissing the banner now only clears memory; the draft stays on the server.
    clearPublishJob()
    expect(fetchMock.mock.calls.some((c) => callKey(c) === 'DELETE /posts/drafts')).toBe(false)
  })

  it('updates the existing draft on failure and deletes it after a successful retry', async () => {
    const creates = [jsonResponse({ error: 'request_failed' }, 500), jsonResponse({ postId: 'post-r' }, 201)]
    const fetchMock = routeFetch({
      'POST /posts': () => creates.shift()!,
      'PATCH /posts/drafts': () => jsonResponse({ draft: { id: 'draft-1' } }),
      'DELETE /posts/drafts': () => jsonResponse({ deleted: true }),
    })
    startPublish(baseInput({ draftId: 'draft-1', sourceText: 'edited body' }))
    await flush()
    expect(getPublishJob()?.savedAsDraft).toBe(true)
    const patch = fetchMock.mock.calls.find((c) => callKey(c) === 'PATCH /posts/drafts')!
    expect(bodyOf(patch)).toMatchObject({ draftId: 'draft-1', sourceText: 'edited body' })

    retryPublish()
    await flush()
    expect(getPublishJob()?.status).toBe('success')
    const del = fetchMock.mock.calls.find((c) => callKey(c) === 'DELETE /posts/drafts')!
    expect(String(del[0])).toContain('draftId=draft-1')
  })

  it('a successful retry deletes the draft the failure created', async () => {
    const creates = [jsonResponse({ error: 'request_failed' }, 500), jsonResponse({ postId: 'post-x' }, 201)]
    const fetchMock = routeFetch({
      'POST /posts': () => creates.shift()!,
      'POST /posts/drafts': () => jsonResponse({ draft: { id: 'draft-from-failure' } }, 201),
      'DELETE /posts/drafts': () => jsonResponse({ deleted: true }),
    })
    startPublish(baseInput())
    await flush()
    retryPublish()
    await flush()
    const del = fetchMock.mock.calls.find((c) => callKey(c) === 'DELETE /posts/drafts')
    expect(String(del?.[0])).toContain('draftId=draft-from-failure')
  })

  it('keeps the failed job in memory (not saved) when the draft save fails too', async () => {
    routeFetch({
      'POST /posts': () => jsonResponse({ error: 'request_failed' }, 500),
      'POST /posts/drafts': () => jsonResponse({ error: 'offline' }, 503),
    })
    startPublish(baseInput({ sourceText: 'only here' }))
    await flush()
    const job = getPublishJob()
    expect(job?.status).toBe('failed')
    expect(job?.savedAsDraft).toBe(false)
    expect(job?.input.sourceText).toBe('only here')
  })

  it('marks a 403 account_restricted as restricted: no retry, no draft write', async () => {
    const fetchMock = routeFetch({
      'POST /posts': () => jsonResponse({ error: 'account_restricted' }, 403),
    })
    startPublish(baseInput())
    await flush()
    const job = getPublishJob()
    expect(job?.status).toBe('failed')
    expect(job?.restricted).toBe(true)
    retryPublish()
    await flush()
    expect(fetchMock.mock.calls.filter((c) => callKey(c) === 'POST /posts')).toHaveLength(1)
    expect(fetchMock.mock.calls.some((c) => callKey(c) === 'POST /posts/drafts')).toBe(false)
  })
})

describe('publish analytics', () => {
  let sent: FeedAnalyticsEvent[] = []
  beforeEach(() => {
    __resetPublishStoreForTest()
    sent = []
    __setFeedEventSinkForTest((e) => sent.push(e))
  })
  afterEach(() => {
    vi.restoreAllMocks()
    __resetPublishStoreForTest()
    __setFeedEventSinkForTest(null)
  })

  it('sends success with image flag and length bucket, never the text', async () => {
    routeFetch({ 'POST /posts': () => jsonResponse({ postId: 'post-1' }, 201) })
    startPublish(baseInput({ imageObjectKey: 'k', sourceText: 'hello world' }))
    await flush()
    expect(sent).toEqual([
      { event: FEED_EVENTS.publishSucceeded, properties: { has_image: true, text_length_bucket: '1-50' } },
    ])
    expect(JSON.stringify(sent)).not.toContain('hello world')
  })

  it('sends failure with a coarse reason', async () => {
    routeFetch({ 'POST /posts': () => jsonResponse({ error: 'account_restricted' }, 403) })
    startPublish(baseInput())
    await flush()
    expect(sent.map((e) => [e.event, e.properties.failure_reason])).toEqual([[FEED_EVENTS.publishFailed, 'restricted']])
  })

  it('classifies failure reasons', () => {
    expect(publishFailureReason({ status: 403, restricted: true }, 'create')).toBe('restricted')
    expect(publishFailureReason({ status: 429, restricted: false }, 'create')).toBe('rate_limited')
    expect(publishFailureReason({ status: 500, restricted: false }, 'image_upload')).toBe('image_upload')
    expect(publishFailureReason({ status: 500, restricted: false }, 'create')).toBe('create')
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __resetPublishStoreForTest,
  clearPublishJob,
  getPublishJob,
  onPublishSuccess,
  retryPublish,
  startPublish,
  type PublishInput,
} from './publish-store'

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
    imageFile: null,
    imageWidth: null,
    imageHeight: null,
    draftId: null,
    ...overrides,
  }
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

  it('uploads the image after creating the post', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ postId: 'post-2' }, 201))
      .mockResolvedValueOnce(jsonResponse({ imageObjectKey: 'k', width: 100, height: 80 }, 201))
    vi.stubGlobal('fetch', fetchMock)

    startPublish(baseInput({ imageFile: new File(['x'], 'p.jpg', { type: 'image/jpeg' }), imageWidth: 100, imageHeight: 80 }))
    await flush()

    expect(getPublishJob()?.status).toBe('success')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const imageUrl = fetchMock.mock.calls[1][0] as string
    expect(imageUrl).toContain('/posts/post-2/image')
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

  it('keeps the created postId when the image step fails so retry only re-uploads', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ postId: 'post-3' }, 201))
      .mockResolvedValueOnce(jsonResponse({ error: 'image_upload_failed' }, 503))
    vi.stubGlobal('fetch', fetchMock)

    startPublish(baseInput({ imageFile: new File(['x'], 'p.jpg', { type: 'image/jpeg' }) }))
    await flush()

    const job = getPublishJob()
    expect(job?.status).toBe('failed')
    expect(job?.postId).toBe('post-3')
  })

  it('ignores a second startPublish while one is running (no duplicate create)', async () => {
    let resolveCreate: (r: Response) => void = () => {}
    const fetchMock = vi.fn().mockImplementation(
      () => new Promise<Response>((resolve) => { resolveCreate = resolve }),
    )
    vi.stubGlobal('fetch', fetchMock)

    startPublish(baseInput())
    startPublish(baseInput()) // ignored — job running
    expect(fetchMock).toHaveBeenCalledTimes(1)

    resolveCreate(jsonResponse({ postId: 'post-4' }, 201))
    await flush()
    expect(getPublishJob()?.status).toBe('success')
  })

  it('retry reuses the same clientPostId', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'request_failed' }, 500))
      .mockResolvedValueOnce(jsonResponse({ postId: 'post-5', duplicate: true }, 200))
    vi.stubGlobal('fetch', fetchMock)

    startPublish(baseInput({ clientPostId: 'reuse-me-000000000001' }))
    await flush()
    expect(getPublishJob()?.status).toBe('failed')

    retryPublish()
    await flush()
    expect(getPublishJob()?.status).toBe('success')

    const firstBody = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    const secondBody = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string)
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
})

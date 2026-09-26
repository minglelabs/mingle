import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// api-contract reads window/env at import; stub the path builder to a plain prefix.
vi.mock('@/lib/api-contract', () => ({
  buildClientApiPath: (endpoint: string) => `/api${endpoint}`,
}))

import {
  createComment,
  deleteComment,
  fetchComments,
  likeComment,
  translateComment,
  unlikeComment,
  updateComment,
} from './comment-api'

function mockFetchOnce(status: number, body: unknown) {
  const res = {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }
  ;(globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(res)
}

describe('comment-api', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn() as unknown as typeof fetch
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetchComments returns the list on 200', async () => {
    mockFetchOnce(200, { comments: [{ id: 'c1' }], commentCount: 1 })
    const res = await fetchComments('p1')
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.commentCount).toBe(1)
      expect(res.comments).toHaveLength(1)
    }
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/posts/p1/comments', expect.objectContaining({ method: 'GET' }))
  })

  it('maps a 429 to rate_limited with retryAfterSeconds', async () => {
    mockFetchOnce(429, { error: 'rate_limited', retryAfterSeconds: 12 })
    const res = await createComment('p1', { sourceText: 'hi' })
    expect(res).toEqual({ ok: false, error: 'rate_limited', retryAfterSeconds: 12 })
  })

  it('defaults retryAfterSeconds when a 429 omits it', async () => {
    mockFetchOnce(429, { error: 'rate_limited' })
    const res = await likeComment('c1')
    expect(res.ok).toBe(false)
    if (!res.ok && res.error === 'rate_limited') {
      expect(res.retryAfterSeconds).toBe(30)
    } else {
      throw new Error('expected rate_limited')
    }
  })

  it('surfaces a snake_case error on 4xx', async () => {
    mockFetchOnce(403, { error: 'forbidden' })
    const res = await deleteComment('c1')
    expect(res).toEqual({ ok: false, error: 'forbidden' })
  })

  it('collapses a thrown fetch to a network error', async () => {
    ;(globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('offline'))
    const res = await updateComment('c1', { sourceText: 'x' })
    expect(res).toEqual({ ok: false, error: 'network' })
  })

  it('unlike issues a DELETE to the like endpoint', async () => {
    mockFetchOnce(200, { liked: false })
    await unlikeComment('c1')
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/comments/c1/like', expect.objectContaining({ method: 'DELETE' }))
  })

  it('translate posts the requested language', async () => {
    mockFetchOnce(200, { commentId: 'c1', text: '번역', status: 'ready' })
    const res = await translateComment('c1', 'ko')
    expect(res.ok).toBe(true)
    const [, init] = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ language: 'ko' })
  })

  it('encodes ids with special characters', async () => {
    mockFetchOnce(200, { liked: true })
    await likeComment('a/b')
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/comments/a%2Fb/like', expect.anything())
  })
})

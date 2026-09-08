import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchReactionJson, REACTION_REQUEST_TIMEOUT_MS } from './message-reaction-request'
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
function stalledFetch() {
  const fetch = vi.fn((_url, init: RequestInit) => new Promise((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
  }))
  vi.stubGlobal('fetch', fetch)
  return fetch
}
describe('reaction request recovery', () => {
  it.each(['GET', 'PUT'])('times out a stalled %s and allows the next request to succeed', async method => {
    vi.useFakeTimers()
    const fetch = stalledFetch()
    const failure = expect(fetchReactionJson('/reactions', { method })).rejects.toThrow('Aborted')
    await vi.advanceTimersByTimeAsync(REACTION_REQUEST_TIMEOUT_MS)
    await failure
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ reactions: [] }) })
    expect(await fetchReactionJson('/reactions')).toEqual({ reactions: [] })
    expect(vi.getTimerCount()).toBe(0)
  })
  it('keeps the deadline through a stalled response body', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn(async (_url, init: RequestInit) => ({ ok: true, json: () => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    }) })))
    const failure = expect(fetchReactionJson('/reactions')).rejects.toThrow('Aborted')
    await vi.advanceTimersByTimeAsync(REACTION_REQUEST_TIMEOUT_MS)
    await failure
  })
  it('cancels immediately when the participant sheet closes', async () => {
    vi.useFakeTimers(); stalledFetch()
    const controller = new AbortController()
    const failure = expect(fetchReactionJson('/reactions', { signal: controller.signal })).rejects.toThrow('Aborted')
    controller.abort()
    await failure
    expect(vi.getTimerCount()).toBe(0)
  })
})

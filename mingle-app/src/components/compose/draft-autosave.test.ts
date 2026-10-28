import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDraftAutosaver, type DraftSnapshot } from './draft-autosave'

function jsonResponse(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function snap(sourceText: string, image: DraftSnapshot['image'] = {}): DraftSnapshot {
  return { sourceText, backgroundKey: 'warm-cream', image }
}

function bodyOf(call: unknown[]): Record<string, unknown> {
  return JSON.parse(String((call[1] as RequestInit).body))
}

describe('draft autosave', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('serializes saves: a save queued behind the first POST PATCHes the draft it created', async () => {
    let resolvePost: (r: Response) => void = () => {}
    const fetchMock = vi.fn((_url: string, init?: RequestInit) =>
      init?.method === 'POST'
        ? new Promise<Response>((resolve) => { resolvePost = resolve })
        : Promise.resolve(jsonResponse({ draft: { id: 'd1' } })),
    )
    vi.stubGlobal('fetch', fetchMock)
    const saver = createDraftAutosaver({ initialDraftId: null, debounceMs: 1000 })

    saver.schedule(snap('first'))
    const first = saver.flush() // POST in flight
    saver.schedule(snap('first + more'))
    const second = saver.flush() // must wait for the POST
    await Promise.resolve()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    resolvePost(jsonResponse({ draft: { id: 'd1' } }, 201))
    await first
    await second

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe('POST')
    expect((fetchMock.mock.calls[1][1] as RequestInit).method).toBe('PATCH')
    expect(bodyOf(fetchMock.mock.calls[1])).toMatchObject({ draftId: 'd1', sourceText: 'first + more' })
    expect(saver.getDraftId()).toBe('d1')
  })

  it('drain() waits for the in-flight POST and returns its draft id (publish before the id is known)', async () => {
    let resolvePost: (r: Response) => void = () => {}
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { resolvePost = resolve })))
    const saver = createDraftAutosaver({ initialDraftId: null, debounceMs: 1000 })

    saver.schedule(snap('hello'))
    void saver.flush()
    const drained = saver.drain()
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    resolvePost(jsonResponse({ draft: { id: 'd-late' } }, 201))
    await expect(drained).resolves.toBe('d-late')
  })

  it('drain() drops a pending debounced save instead of creating a draft for a post being published', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const saver = createDraftAutosaver({ initialDraftId: null, debounceMs: 1000 })
    saver.schedule(snap('about to publish'))
    await expect(saver.drain()).resolves.toBeNull()
    await vi.advanceTimersByTimeAsync(2000)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('flush() saves the last keystroke immediately (leaving the screen)', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn(async () => jsonResponse({ draft: { id: 'd1' } }))
    vi.stubGlobal('fetch', fetchMock)
    const saver = createDraftAutosaver({ initialDraftId: 'd1', debounceMs: 1200 })
    saver.schedule(snap('a'))
    saver.schedule(snap('ab'))
    await saver.flush()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(bodyOf(fetchMock.mock.calls[0] as unknown[])).toMatchObject({ draftId: 'd1', sourceText: 'ab' })
    expect((fetchMock.mock.calls[0] as unknown[])[1]).toMatchObject({ keepalive: true })
    // The debounce timer was consumed by the flush: no second save later.
    await vi.advanceTimersByTimeAsync(5000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('never creates a draft for an empty new post', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const saver = createDraftAutosaver({ initialDraftId: null, debounceMs: 10 })
    saver.schedule(snap('   '))
    await saver.flush()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reports a restricted account and keeps the draft id unset', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'account_restricted' }, 403)))
    const states: string[] = []
    const saver = createDraftAutosaver({
      initialDraftId: null,
      debounceMs: 10,
      onState: (s) => states.push(`${s.saving}:${s.error}`),
    })
    saver.schedule(snap('text'))
    await saver.flush()
    expect(states.at(-1)).toBe('false:restricted')
    expect(saver.getDraftId()).toBeNull()
  })

  it('close() stops all later saves', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const saver = createDraftAutosaver({ initialDraftId: 'd1', debounceMs: 10 })
    saver.close()
    saver.schedule(snap('after publish'))
    await saver.flush()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

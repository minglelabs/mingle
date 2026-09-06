import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type OutboxModule = typeof import('./client-message-outbox')

function createStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() {
      return values.size
    },
    clear() {
      values.clear()
    },
    getItem(key: string) {
      return values.get(key) ?? null
    },
    key(index: number) {
      return [...values.keys()][index] ?? null
    },
    removeItem(key: string) {
      values.delete(key)
    },
    setItem(key: string, value: string) {
      values.set(key, value)
    },
  }
}

describe('client message outbox', () => {
  let outbox: OutboxModule
  let localStorage: Storage

  beforeEach(async () => {
    localStorage = createStorage()
    vi.stubGlobal('window', {
      localStorage,
      fetch: vi.fn(),
    })
    vi.resetModules()
    outbox = await import('./client-message-outbox')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('deduplicates the same idempotent message while retaining the latest payload', () => {
    const ownerIdentity = outbox.buildClientMessageOutboxOwnerIdentity({
      userId: 'user-1',
      trackingUserId: 'tracking-1',
    })
    const id = outbox.buildClientMessageOutboxId({
      ownerIdentity,
      sessionKey: 'session-1',
      clientMessageId: 'message-1',
    })

    outbox.enqueueClientMessageOutboxRecord({
      id,
      ownerIdentity,
      endpoint: '/api/ios/v2.0.0/log/client-event',
      body: '{"sourceText":"first"}',
      trackingUserId: 'tracking-1',
      now: 1_000,
    })
    outbox.enqueueClientMessageOutboxRecord({
      id,
      ownerIdentity,
      endpoint: '/api/ios/v2.0.0/log/client-event',
      body: '{"sourceText":"latest"}',
      trackingUserId: 'tracking-1',
      now: 2_000,
    })

    expect(outbox.readClientMessageOutboxRecords(ownerIdentity, 2_000)).toEqual([
      expect.objectContaining({
        id,
        body: '{"sourceText":"latest"}',
        createdAt: 1_000,
      }),
    ])
    expect(localStorage.length).toBe(1)
  })

  it('retains failed sends and removes them only after the server acknowledges delivery', async () => {
    const ownerIdentity = 'user:user-1'
    outbox.enqueueClientMessageOutboxRecord({
      id: 'outbox-1',
      ownerIdentity,
      endpoint: '/api/ios/v2.0.0/log/client-event',
      body: '{"eventType":"stt_turn_finalized"}',
      trackingUserId: 'tracking-1',
      now: 1_000,
    })

    const failedFetch = vi.fn(async () => new Response(null, { status: 503 }))
    expect(await outbox.flushClientMessageOutbox({
      ownerIdentity,
      fetchImpl: failedFetch,
      force: true,
      now: () => 2_000,
    })).toEqual({ delivered: 0, retained: 1 })
    expect(outbox.readClientMessageOutboxRecords(ownerIdentity, 2_000)[0]).toEqual(
      expect.objectContaining({ attemptCount: 1, nextAttemptAt: 4_000 }),
    )

    const successfulFetch = vi.fn(async () => new Response(null, { status: 204 }))
    expect(await outbox.flushClientMessageOutbox({
      ownerIdentity,
      fetchImpl: successfulFetch,
      force: true,
      now: () => 2_500,
    })).toEqual({ delivered: 1, retained: 0 })
    expect(outbox.readClientMessageOutboxRecords(ownerIdentity, 2_500)).toEqual([])
    expect(localStorage.length).toBe(0)
  })

  it('retains a newer payload when an older delivery succeeds in flight', async () => {
    const ownerIdentity = 'user:user-1'
    const record = {
      id: 'outbox-1',
      ownerIdentity,
      endpoint: '/api/ios/v2.0.0/log/client-event',
      trackingUserId: 'tracking-1',
    }
    outbox.enqueueClientMessageOutboxRecord({
      ...record,
      body: '{"sourceText":"first"}',
      now: 1_000,
    })

    let resolveFirstDelivery: (response: Response) => void = () => {}
    const firstDelivery = new Promise<Response>((resolve) => {
      resolveFirstDelivery = resolve
    })
    const fetchImpl = vi.fn(() => firstDelivery)
    const firstFlush = outbox.flushClientMessageOutbox({
      ownerIdentity,
      fetchImpl,
      force: true,
      now: () => 1_500,
    })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    outbox.enqueueClientMessageOutboxRecord({
      ...record,
      body: '{"sourceText":"latest"}',
      now: 2_000,
    })
    resolveFirstDelivery(new Response(null, { status: 204 }))
    await firstFlush

    expect(outbox.readClientMessageOutboxRecords(ownerIdentity, 2_000)).toEqual([
      expect.objectContaining({ body: '{"sourceText":"latest"}' }),
    ])

    const nextFetch = vi.fn(async () => new Response(null, { status: 204 }))
    await outbox.flushClientMessageOutbox({
      ownerIdentity,
      fetchImpl: nextFetch,
      force: true,
      now: () => 2_500,
    })

    expect(nextFetch).toHaveBeenCalledWith(
      record.endpoint,
      expect.objectContaining({ body: '{"sourceText":"latest"}' }),
    )
    expect(outbox.readClientMessageOutboxRecords(ownerIdentity, 2_500)).toEqual([])
  })

  it('does not apply an older delivery retry to a newer payload in flight', async () => {
    const ownerIdentity = 'user:user-1'
    const record = {
      id: 'outbox-1',
      ownerIdentity,
      endpoint: '/api/ios/v2.0.0/log/client-event',
      trackingUserId: 'tracking-1',
    }
    outbox.enqueueClientMessageOutboxRecord({
      ...record,
      body: '{"sourceText":"first"}',
      now: 1_000,
    })

    let resolveFirstDelivery: (response: Response) => void = () => {}
    const firstDelivery = new Promise<Response>((resolve) => {
      resolveFirstDelivery = resolve
    })
    const firstFlush = outbox.flushClientMessageOutbox({
      ownerIdentity,
      fetchImpl: vi.fn(() => firstDelivery),
      force: true,
      now: () => 1_500,
    })

    outbox.enqueueClientMessageOutboxRecord({
      ...record,
      body: '{"sourceText":"latest"}',
      now: 2_000,
    })
    resolveFirstDelivery(new Response(null, { status: 503 }))
    await firstFlush

    expect(outbox.readClientMessageOutboxRecords(ownerIdentity, 2_000)).toEqual([
      expect.objectContaining({
        body: '{"sourceText":"latest"}',
        attemptCount: 0,
        nextAttemptAt: 0,
      }),
    ])
  })

  it('never flushes another account\'s queued message', async () => {
    outbox.enqueueClientMessageOutboxRecord({
      id: 'outbox-user-a',
      ownerIdentity: 'user:user-a',
      endpoint: '/api/android/v2.0.0/log/client-event',
      body: '{"eventType":"stt_turn_finalized"}',
      trackingUserId: 'tracking-a',
      now: 1_000,
    })
    outbox.enqueueClientMessageOutboxRecord({
      id: 'outbox-user-b',
      ownerIdentity: 'user:user-b',
      endpoint: '/api/android/v2.0.0/log/client-event',
      body: '{"eventType":"stt_turn_finalized"}',
      trackingUserId: 'tracking-b',
      now: 1_001,
    })

    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }))
    await outbox.flushClientMessageOutbox({
      ownerIdentity: 'user:user-a',
      fetchImpl,
      force: true,
      now: () => 2_000,
    })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(outbox.readClientMessageOutboxRecords('user:user-a', 2_000)).toEqual([])
    expect(outbox.readClientMessageOutboxRecords('user:user-b', 2_000)).toHaveLength(1)
  })

  it('adopts a pre-session tracking record when the authenticated user id becomes available', async () => {
    const trackingOwnerIdentity = outbox.buildClientMessageOutboxOwnerIdentity({
      trackingUserId: 'tracking-1',
    })
    const userOwnerIdentity = outbox.buildClientMessageOutboxOwnerIdentity({
      userId: 'user-1',
      trackingUserId: 'tracking-1',
    })
    const trackingRecordId = outbox.buildClientMessageOutboxId({
      ownerIdentity: trackingOwnerIdentity,
      sessionKey: 'session-1',
      clientMessageId: 'message-1',
    })

    outbox.enqueueClientMessageOutboxRecord({
      id: trackingRecordId,
      ownerIdentity: trackingOwnerIdentity,
      endpoint: '/api/ios/v2.0.0/log/client-event',
      body: '{"eventType":"stt_turn_finalized"}',
      trackingUserId: 'tracking-1',
      now: 1_000,
    })

    await expect(outbox.adoptClientMessageOutboxRecords({
      fromOwnerIdentity: trackingOwnerIdentity,
      toOwnerIdentity: userOwnerIdentity,
      now: 2_000,
    })).resolves.toBe(1)

    expect(outbox.readClientMessageOutboxRecords(trackingOwnerIdentity, 2_000)).toEqual([])
    expect(outbox.readClientMessageOutboxRecords(userOwnerIdentity, 2_000)).toEqual([
      expect.objectContaining({
        id: outbox.buildClientMessageOutboxId({
          ownerIdentity: userOwnerIdentity,
          sessionKey: 'session-1',
          clientMessageId: 'message-1',
        }),
        ownerIdentity: userOwnerIdentity,
        nextAttemptAt: 0,
      }),
    ])
  })
})

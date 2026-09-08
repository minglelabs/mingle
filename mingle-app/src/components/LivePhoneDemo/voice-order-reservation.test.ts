import { afterEach, expect, it, vi } from 'vitest'
import { reserveVoiceOrder, consumeVoiceOrder, rememberLiveVoiceOrder, getVoiceOrderReceipt } from './voice-order-reservation'
const scope = { ownerIdentity: 'user:alice', apiNamespace: 'ios/v2.0.2', sessionKey: 'room', clientMessageId: 'voice' }
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

it('reserves once per turn, isolates accounts and retains the receipt for retries', async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ orderReceipt: 'signed' }))
  vi.stubGlobal('fetch', fetcher)
  reserveVoiceOrder(scope, '/start', 'tracking')
  reserveVoiceOrder(scope, '/start', 'tracking')
  expect(await consumeVoiceOrder(scope)).toBe('signed')
  expect(await consumeVoiceOrder(scope)).toBe('signed')
  expect(await consumeVoiceOrder({ ...scope, ownerIdentity: 'user:bob' })).toBeNull()
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({ clientMessageId: 'voice', reserveOrder: true })
  expect(fetcher.mock.calls[0][1].headers['x-mingle-expected-account-id']).toBe('alice')
})

it('bounds unavailable reservations even if a transport ignores abort', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
  const offline = { ...scope, clientMessageId: 'offline' }
  reserveVoiceOrder(offline, '/start', 'tracking')
  const pending = consumeVoiceOrder(offline)
  await vi.advanceTimersByTimeAsync(200)
  expect(await pending).toBeNull()
  await vi.advanceTimersByTimeAsync(3300)
})

it('does not replace a socket receipt when an outstanding HTTP response completes later', async () => {
  let finish!: (value: Response) => void
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { finish = resolve })))
  const racing = { ...scope, clientMessageId: 'racing' }
  reserveVoiceOrder(racing, '/start', 'tracking')
  await Promise.resolve()
  const pending = consumeVoiceOrder(racing)
  rememberLiveVoiceOrder(racing, 'socket-order')
  finish(Response.json({ orderReceipt: 'late-http-order' }))
  expect(await pending).toBe('socket-order')
  expect(await consumeVoiceOrder(racing)).toBe('socket-order')
  expect(getVoiceOrderReceipt(racing)).toBe('socket-order')
})

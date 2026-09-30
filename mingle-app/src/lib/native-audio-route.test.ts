import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  EMPTY_NATIVE_AUDIO_ROUTE_SNAPSHOT,
  NATIVE_AUDIO_ROUTE_EVENT,
  NATIVE_AUDIO_ROUTE_STATE_KEY,
  NATIVE_CAPABILITIES_EVENT,
  getNativeAudioRouteSnapshot,
  isNativeAudioRouteSupported,
  markNativeAudioRouteDisconnected,
  parseNativeAudioRouteCapability,
  parseNativeAudioRouteEvent,
  reduceNativeAudioRouteSnapshot,
  requestNativeAudioRoute,
  resetNativeAudioRouteStoreForTests,
  subscribeNativeAudioRoute,
} from './native-audio-route'

function route(overrides: Record<string, unknown> = {}) {
  return {
    type: 'audio_route',
    platform: 'ios',
    earphonesConnected: true,
    routeKind: 'bluetooth',
    outputTypes: ['BluetoothA2DPOutput'],
    reason: 'new_device_available',
    atMs: 1_700_000_000_000,
    ...overrides,
  }
}

describe('parseNativeAudioRouteEvent', () => {
  it('accepts a contract v1 route report', () => {
    expect(parseNativeAudioRouteEvent(route())).toEqual({
      kind: 'route',
      detail: route(),
    })
  })

  it('keeps an unknown route kind as a valid report labelled other', () => {
    const parsed = parseNativeAudioRouteEvent(route({ routeKind: 'dock', earphonesConnected: false }))
    expect(parsed).toMatchObject({ kind: 'route', detail: { routeKind: 'other', earphonesConnected: false } })
  })

  it('drops non-string output types and never needs a device name', () => {
    const parsed = parseNativeAudioRouteEvent(route({ outputTypes: ['Headphones', 3, null, 'Speaker'] }))
    expect(parsed).toMatchObject({ kind: 'route', detail: { outputTypes: ['Headphones', 'Speaker'] } })
  })

  it.each([
    ['earphonesConnected not boolean', { earphonesConnected: 'yes' }],
    ['unknown platform', { platform: 'web' }],
    ['routeKind not a string', { routeKind: 4 }],
    ['outputTypes not an array', { outputTypes: 'Speaker' }],
    ['atMs missing', { atMs: undefined }],
    ['atMs not finite', { atMs: Number.NaN }],
  ])('flags a malformed audio_route payload (%s)', (_label, overrides) => {
    expect(parseNativeAudioRouteEvent(route(overrides))).toEqual({ kind: 'malformed_route' })
  })

  it.each([
    null,
    undefined,
    'audio_route',
    [],
    { type: 'capabilities', audioRoute: true },
    { type: 'tts_started' },
  ])('ignores payloads that are not audio-route reports (%j)', (detail) => {
    expect(parseNativeAudioRouteEvent(detail)).toEqual({ kind: 'ignored' })
  })
})

describe('capability detection', () => {
  it('reads audioRoute from the capabilities message; old shells report none', () => {
    expect(parseNativeAudioRouteCapability({ type: 'capabilities', openAppSettings: true, audioRoute: true })).toBe(true)
    expect(parseNativeAudioRouteCapability({ type: 'capabilities', openAppSettings: true })).toBe(false)
    expect(parseNativeAudioRouteCapability({ type: 'capabilities', audioRoute: 'true' })).toBe(false)
    expect(parseNativeAudioRouteCapability({ type: 'status', status: 'ready' })).toBeNull()
  })

  it('is unsupported until the shell reports audio routes', () => {
    expect(isNativeAudioRouteSupported(EMPTY_NATIVE_AUDIO_ROUTE_SNAPSHOT)).toBe(false)
  })

  it('treats a route report as the capability when the capabilities message was missed', () => {
    const snapshot = reduceNativeAudioRouteSnapshot(EMPTY_NATIVE_AUDIO_ROUTE_SNAPSHOT, { type: 'route', detail: route() })
    expect(snapshot.capability).toBeNull()
    expect(isNativeAudioRouteSupported(snapshot)).toBe(true)
    expect(snapshot.earphonesConnected).toBe(true)
  })

  it('lets a seen capabilities message decide (old shell = hidden even if something dispatched a route)', () => {
    const oldShell = reduceNativeAudioRouteSnapshot(EMPTY_NATIVE_AUDIO_ROUTE_SNAPSHOT, {
      type: 'capabilities',
      detail: { type: 'capabilities', openAppSettings: true },
    })
    expect(isNativeAudioRouteSupported(oldShell)).toBe(false)
    const withRoute = reduceNativeAudioRouteSnapshot(oldShell, { type: 'route', detail: route() })
    expect(isNativeAudioRouteSupported(withRoute)).toBe(false)

    const newShell = reduceNativeAudioRouteSnapshot(EMPTY_NATIVE_AUDIO_ROUTE_SNAPSHOT, {
      type: 'capabilities',
      detail: { type: 'capabilities', openAppSettings: true, audioRoute: true },
    })
    expect(isNativeAudioRouteSupported(newShell)).toBe(true)
    // Supported, but no route yet: unknown = not connected.
    expect(newShell.earphonesConnected).toBe(false)
  })
})

describe('reduceNativeAudioRouteSnapshot', () => {
  it('reads a malformed report as not connected instead of keeping the last value', () => {
    const connected = reduceNativeAudioRouteSnapshot(EMPTY_NATIVE_AUDIO_ROUTE_SNAPSHOT, { type: 'route', detail: route() })
    const malformed = reduceNativeAudioRouteSnapshot(connected, {
      type: 'route',
      detail: { type: 'audio_route', earphonesConnected: 'maybe' },
    })
    expect(malformed.earphonesConnected).toBe(false)
    expect(malformed.routeReported).toBe(true)
  })

  it('ignores unrelated payloads without changing identity', () => {
    const connected = reduceNativeAudioRouteSnapshot(EMPTY_NATIVE_AUDIO_ROUTE_SNAPSHOT, { type: 'route', detail: route() })
    expect(reduceNativeAudioRouteSnapshot(connected, { type: 'route', detail: { type: 'status' } })).toBe(connected)
  })

  it('keeps identity for a repeat of the same route (request replies)', () => {
    const connected = reduceNativeAudioRouteSnapshot(EMPTY_NATIVE_AUDIO_ROUTE_SNAPSHOT, { type: 'route', detail: route() })
    const repeat = reduceNativeAudioRouteSnapshot(connected, { type: 'route', detail: route({ reason: 'request', atMs: 2 }) })
    expect(repeat).toBe(connected)
  })

  it('applies a disconnect hint at once and a later connect report again', () => {
    const connected = reduceNativeAudioRouteSnapshot(EMPTY_NATIVE_AUDIO_ROUTE_SNAPSHOT, { type: 'route', detail: route() })
    const hinted = reduceNativeAudioRouteSnapshot(connected, { type: 'disconnect_hint' })
    expect(hinted.earphonesConnected).toBe(false)
    const reconnected = reduceNativeAudioRouteSnapshot(hinted, { type: 'route', detail: route({ atMs: 3 }) })
    expect(reconnected.earphonesConnected).toBe(true)
  })
})

describe('page-wide store', () => {
  let target: EventTarget & Record<string, unknown>

  beforeEach(() => {
    resetNativeAudioRouteStoreForTests()
    target = new EventTarget() as EventTarget & Record<string, unknown>
    vi.stubGlobal('window', target)
  })

  afterEach(() => {
    resetNativeAudioRouteStoreForTests()
    vi.unstubAllGlobals()
  })

  it('reads the late-reader cache a room finds when it mounts after load end', () => {
    target[NATIVE_AUDIO_ROUTE_STATE_KEY] = route({ routeKind: 'wired', outputTypes: ['Headphones'] })
    const snapshot = getNativeAudioRouteSnapshot()
    expect(isNativeAudioRouteSupported(snapshot)).toBe(true)
    expect(snapshot.earphonesConnected).toBe(true)
    expect(snapshot.route?.routeKind).toBe('wired')
  })

  it('follows live route and capabilities events and notifies subscribers', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeNativeAudioRoute(listener)

    target.dispatchEvent(new CustomEvent(NATIVE_CAPABILITIES_EVENT, {
      detail: { type: 'capabilities', openAppSettings: true, audioRoute: true },
    }))
    expect(getNativeAudioRouteSnapshot().capability).toBe(true)

    target.dispatchEvent(new CustomEvent(NATIVE_AUDIO_ROUTE_EVENT, { detail: route() }))
    expect(getNativeAudioRouteSnapshot().earphonesConnected).toBe(true)

    target.dispatchEvent(new CustomEvent(NATIVE_AUDIO_ROUTE_EVENT, {
      detail: route({ earphonesConnected: false, routeKind: 'speaker', outputTypes: ['Speaker'] }),
    }))
    expect(getNativeAudioRouteSnapshot().earphonesConnected).toBe(false)
    expect(listener).toHaveBeenCalledTimes(3)

    unsubscribe()
    target.dispatchEvent(new CustomEvent(NATIVE_AUDIO_ROUTE_EVENT, { detail: route({ atMs: 9 }) }))
    expect(listener).toHaveBeenCalledTimes(3)
  })

  it('closes the gate synchronously on a disconnect hint', () => {
    const listener = vi.fn(() => {
      expect(getNativeAudioRouteSnapshot().earphonesConnected).toBe(false)
    })
    target[NATIVE_AUDIO_ROUTE_STATE_KEY] = route()
    expect(getNativeAudioRouteSnapshot().earphonesConnected).toBe(true)
    subscribeNativeAudioRoute(listener)
    markNativeAudioRouteDisconnected()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('posts native_audio_route_request only inside the app shell', () => {
    expect(requestNativeAudioRoute()).toBe(false)
    const postMessage = vi.fn()
    target.ReactNativeWebView = { postMessage }
    expect(requestNativeAudioRoute()).toBe(true)
    expect(JSON.parse(postMessage.mock.calls[0][0])).toEqual({ type: 'native_audio_route_request', payload: {} })
  })
})

// Web side of the earphone-mode bridge contract v1 (native -> web audio route,
// web -> native route request). The shell sends a `capabilities` message with
// `audioRoute: true` on the `mingle:native-stt` channel at every WebView load
// end, then a `mingle:native-audio-route` event whose detail it first assigns to
// `window.__MINGLE_LAST_NATIVE_AUDIO_ROUTE` for late readers.
//
// The capabilities message itself is not cached by the shell, and a room
// usually mounts long after load end, so a cached (or live) route report is
// accepted as proof of the same capability: only shells that implement the
// contract ever send one. A capabilities message that is seen wins.

export const NATIVE_AUDIO_ROUTE_EVENT = 'mingle:native-audio-route'
export const NATIVE_AUDIO_ROUTE_STATE_KEY = '__MINGLE_LAST_NATIVE_AUDIO_ROUTE'
// The capabilities message rides the existing native STT channel.
export const NATIVE_CAPABILITIES_EVENT = 'mingle:native-stt'
export const NATIVE_AUDIO_ROUTE_REQUEST_TYPE = 'native_audio_route_request'

export const NATIVE_AUDIO_ROUTE_KINDS = [
  'wired',
  'bluetooth',
  'usb',
  'hearing_aid',
  'speaker',
  'receiver',
  'car',
  'airplay',
  'hdmi',
  'other',
  'none',
] as const

export type NativeAudioRouteKind = typeof NATIVE_AUDIO_ROUTE_KINDS[number]

export type NativeAudioRouteDetail = {
  type: 'audio_route'
  platform: 'ios' | 'android'
  earphonesConnected: boolean
  routeKind: NativeAudioRouteKind
  outputTypes: string[]
  reason?: string
  atMs: number
  requestId?: string
}

export type NativeAudioRouteParseResult =
  | { kind: 'route', detail: NativeAudioRouteDetail }
  // An `audio_route` payload whose fields do not match the contract. Its
  // claimed values are ignored, and the route is treated as unknown (= not
  // connected) so a garbled report can never keep auto-read on the speaker.
  | { kind: 'malformed_route' }
  // Not an audio-route payload at all.
  | { kind: 'ignored' }

export type NativeAudioRouteSnapshot = {
  // audioRoute flag of the last capabilities message seen on this page;
  // null when none was seen (the usual case for a room mounted after load end).
  capability: boolean | null
  // Last well-formed route report.
  route: NativeAudioRouteDetail | null
  // Any audio-route report (cached or live, well-formed or not) was seen.
  routeReported: boolean
  // Unknown, malformed or hinted-disconnected all read as false.
  earphonesConnected: boolean
}

export const EMPTY_NATIVE_AUDIO_ROUTE_SNAPSHOT: NativeAudioRouteSnapshot = Object.freeze({
  capability: null,
  route: null,
  routeReported: false,
  earphonesConnected: false,
}) as NativeAudioRouteSnapshot

const MAX_OUTPUT_TYPES = 16
const MAX_OUTPUT_TYPE_LENGTH = 64
const MAX_REASON_LENGTH = 64

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNativeAudioRouteKind(value: string): value is NativeAudioRouteKind {
  return (NATIVE_AUDIO_ROUTE_KINDS as readonly string[]).includes(value)
}

export function parseNativeAudioRouteEvent(detail: unknown): NativeAudioRouteParseResult {
  if (!isRecord(detail) || detail.type !== 'audio_route') return { kind: 'ignored' }

  const { platform, earphonesConnected, routeKind, outputTypes, reason, atMs } = detail
  if (typeof earphonesConnected !== 'boolean') return { kind: 'malformed_route' }
  if (platform !== 'ios' && platform !== 'android') return { kind: 'malformed_route' }
  if (typeof routeKind !== 'string') return { kind: 'malformed_route' }
  if (!Array.isArray(outputTypes)) return { kind: 'malformed_route' }
  if (typeof atMs !== 'number' || !Number.isFinite(atMs)) return { kind: 'malformed_route' }

  const normalizedRouteKind = routeKind.trim().toLowerCase()
  const sanitizedOutputTypes = outputTypes
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.slice(0, MAX_OUTPUT_TYPE_LENGTH))
    .slice(0, MAX_OUTPUT_TYPES)

  return {
    kind: 'route',
    detail: {
      type: 'audio_route',
      platform,
      earphonesConnected,
      // A kind added by a later shell is still a valid report; only
      // `earphonesConnected` decides anything.
      routeKind: isNativeAudioRouteKind(normalizedRouteKind) ? normalizedRouteKind : 'other',
      outputTypes: sanitizedOutputTypes,
      ...(typeof reason === 'string' && reason.trim()
        ? { reason: reason.trim().slice(0, MAX_REASON_LENGTH) }
        : {}),
      atMs,
      ...(typeof detail.requestId === 'string' && detail.requestId.trim()
        ? { requestId: detail.requestId.trim().slice(0, 128) } : {}),
    },
  }
}

// null = not a capabilities message; otherwise the shell's audioRoute flag.
// Old shells send `{ type: 'capabilities', openAppSettings: true }` only.
export function parseNativeAudioRouteCapability(detail: unknown): boolean | null {
  if (!isRecord(detail) || detail.type !== 'capabilities') return null
  return detail.audioRoute === true
}

export function isNativeAudioRouteSupported(snapshot: NativeAudioRouteSnapshot): boolean {
  if (snapshot.capability !== null) return snapshot.capability
  return snapshot.routeReported
}

export function reduceNativeAudioRouteSnapshot(
  current: NativeAudioRouteSnapshot,
  signal:
    | { type: 'route', detail: unknown }
    | { type: 'capabilities', detail: unknown }
    | { type: 'disconnect_hint' },
): NativeAudioRouteSnapshot {
  if (signal.type === 'capabilities') {
    const capability = parseNativeAudioRouteCapability(signal.detail)
    if (capability === null || capability === current.capability) return current
    return { ...current, capability }
  }

  if (signal.type === 'disconnect_hint') {
    if (!current.earphonesConnected) return current
    return { ...current, earphonesConnected: false }
  }

  const parsed = parseNativeAudioRouteEvent(signal.detail)
  if (parsed.kind === 'ignored') return current
  if (parsed.kind === 'malformed_route') {
    if (current.routeReported && !current.earphonesConnected) return current
    return { ...current, routeReported: true, earphonesConnected: false }
  }

  const { detail } = parsed
  if (
    current.routeReported
    && current.earphonesConnected === detail.earphonesConnected
    && current.route?.routeKind === detail.routeKind
    && current.route.platform === detail.platform
  ) {
    // Same meaning (e.g. a reply to a route request): keep the snapshot
    // identity so subscribers do not re-render for nothing.
    return current
  }
  return {
    ...current,
    route: detail,
    routeReported: true,
    earphonesConnected: detail.earphonesConnected,
  }
}

// ── Page-wide store (one per window, shared by every mounted room) ─────────

type NativeAudioRouteWindow = Window & {
  [NATIVE_AUDIO_ROUTE_STATE_KEY]?: unknown
  ReactNativeWebView?: {
    postMessage?: (message: string) => void
  }
}

let storeSnapshot: NativeAudioRouteSnapshot = EMPTY_NATIVE_AUDIO_ROUTE_SNAPSHOT
let cachedRouteRead = false
const storeListeners = new Set<() => void>()
let detachWindowListeners: (() => void) | null = null

function emitStoreChange(): void {
  for (const listener of [...storeListeners]) {
    listener()
  }
}

function applyStoreSignal(
  signal: Parameters<typeof reduceNativeAudioRouteSnapshot>[1],
): void {
  const next = reduceNativeAudioRouteSnapshot(storeSnapshot, signal)
  if (next === storeSnapshot) return
  storeSnapshot = next
  emitStoreChange()
}

function readCachedRouteOnce(): void {
  if (cachedRouteRead || typeof window === 'undefined') return
  cachedRouteRead = true
  const cached = (window as NativeAudioRouteWindow)[NATIVE_AUDIO_ROUTE_STATE_KEY]
  if (cached === undefined) return
  // Called from getSnapshot as well, so update without notifying: the caller
  // is about to read the new snapshot anyway.
  storeSnapshot = reduceNativeAudioRouteSnapshot(storeSnapshot, { type: 'route', detail: cached })
}

function attachWindowListeners(): () => void {
  const handleRoute = (event: Event) => {
    applyStoreSignal({ type: 'route', detail: (event as CustomEvent<unknown>).detail })
  }
  const handleCapabilities = (event: Event) => {
    applyStoreSignal({ type: 'capabilities', detail: (event as CustomEvent<unknown>).detail })
  }
  window.addEventListener(NATIVE_AUDIO_ROUTE_EVENT, handleRoute)
  window.addEventListener(NATIVE_CAPABILITIES_EVENT, handleCapabilities)
  return () => {
    window.removeEventListener(NATIVE_AUDIO_ROUTE_EVENT, handleRoute)
    window.removeEventListener(NATIVE_CAPABILITIES_EVENT, handleCapabilities)
  }
}

export function subscribeNativeAudioRoute(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {}

  storeListeners.add(listener)
  if (!detachWindowListeners) {
    detachWindowListeners = attachWindowListeners()
    const before = storeSnapshot
    readCachedRouteOnce()
    if (storeSnapshot !== before) emitStoreChange()
  }

  return () => {
    storeListeners.delete(listener)
    if (storeListeners.size === 0 && detachWindowListeners) {
      detachWindowListeners()
      detachWindowListeners = null
      // Re-read the late-reader cache on the next subscription: events that
      // arrive while nobody listens still land there.
      cachedRouteRead = false
    }
  }
}

export function getNativeAudioRouteSnapshot(): NativeAudioRouteSnapshot {
  readCachedRouteOnce()
  return storeSnapshot
}

export function getNativeAudioRouteServerSnapshot(): NativeAudioRouteSnapshot {
  return EMPTY_NATIVE_AUDIO_ROUTE_SNAPSHOT
}

// A native `tts_stopped` with reason `earphones_disconnected` proves the
// earphones are gone before the route event lands; act on it at once.
export function markNativeAudioRouteDisconnected(): void {
  applyStoreSignal({ type: 'disconnect_hint' })
}

// Asks the shell to re-read the route and send the route event (contract A.4).
// Old shells ignore unknown message types. Returns false outside the app.
export function requestNativeAudioRoute(): boolean {
  if (typeof window === 'undefined') return false
  const bridge = (window as NativeAudioRouteWindow).ReactNativeWebView
  if (typeof bridge?.postMessage !== 'function') return false

  try {
    bridge.postMessage(JSON.stringify({ type: NATIVE_AUDIO_ROUTE_REQUEST_TYPE, payload: {} }))
    return true
  } catch {
    return false
  }
}

// Android HTML audio has no native per-clip guard. A cached connected route
// cannot authorize a new clip after the system media output was changed.
let routeRequestSequence = 0
export function confirmNativeEarphonesConnected(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false)
  const bridge = (window as NativeAudioRouteWindow).ReactNativeWebView
  if (typeof bridge?.postMessage !== 'function') return Promise.resolve(false)
  const requestId = `earphone-check-${Date.now()}-${++routeRequestSequence}`
  return new Promise((resolve) => {
    const finish = (connected: boolean) => {
      clearTimeout(timer)
      window.removeEventListener(NATIVE_AUDIO_ROUTE_EVENT, handleReply)
      resolve(connected)
    }
    const handleReply = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail
      if (!isRecord(detail) || detail.requestId !== requestId) return
      const parsed = parseNativeAudioRouteEvent(detail)
      finish(parsed.kind === 'route' && parsed.detail.earphonesConnected)
    }
    const timer = setTimeout(() => finish(false), 1500)
    window.addEventListener(NATIVE_AUDIO_ROUTE_EVENT, handleReply)
    try {
      bridge.postMessage!(JSON.stringify({ type: NATIVE_AUDIO_ROUTE_REQUEST_TYPE, payload: { requestId } }))
    } catch {
      finish(false)
    }
  })
}

export function resetNativeAudioRouteStoreForTests(): void {
  detachWindowListeners?.()
  detachWindowListeners = null
  storeListeners.clear()
  storeSnapshot = EMPTY_NATIVE_AUDIO_ROUTE_SNAPSHOT
  cachedRouteRead = false
}

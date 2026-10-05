// Web side of device-audio capture: transcribing the sound other apps play on
// this device (a video, a call) instead of the microphone.
//
// The shell reports `deviceAudioCapture: true` in its `capabilities` message on
// the `mingle:native-stt` channel at every WebView load end, and keeps the last
// message in `window.__MINGLE_NATIVE_SHELL_CAPABILITIES` for rooms that mount
// later. A shell that sends neither can only capture the microphone.
//
// The choice itself is session state, like the earphone-mode read language:
// it is never persisted, so a Start can never surprise the user with the
// system screen-capture prompt for a choice made on another day.

export const NATIVE_SHELL_CAPABILITIES_EVENT = 'mingle:native-stt'
export const NATIVE_SHELL_CAPABILITIES_STATE_KEY = '__MINGLE_NATIVE_SHELL_CAPABILITIES'

export type SttCaptureSource = 'microphone' | 'device_audio'

// null = not a capabilities message; otherwise the shell's deviceAudioCapture
// flag. Older shells send a capabilities message without it.
export function parseNativeDeviceAudioCapability(detail: unknown): boolean | null {
  if (typeof detail !== 'object' || detail === null || Array.isArray(detail)) return null
  const record = detail as Record<string, unknown>
  if (record.type !== 'capabilities') return null
  return record.deviceAudioCapture === true
}

// Device audio is captured only while earphone mode is on (that is where the
// choice is made and explained) and only on a shell that can do it.
export function resolveEffectiveSttCaptureSource(input: {
  supported: boolean
  earphoneModeEnabled: boolean
  pick: SttCaptureSource
}): SttCaptureSource {
  return input.supported && input.earphoneModeEnabled && input.pick === 'device_audio'
    ? 'device_audio'
    : 'microphone'
}

// ── Capability store (one per window, shared by every mounted room) ────────

type NativeDeviceAudioWindow = Window & {
  [NATIVE_SHELL_CAPABILITIES_STATE_KEY]?: unknown
}

let capabilitySnapshot = false
let cachedCapabilityRead = false
const capabilityListeners = new Set<() => void>()
let detachCapabilityListener: (() => void) | null = null

function applyCapability(detail: unknown, notify: boolean): void {
  const capability = parseNativeDeviceAudioCapability(detail)
  if (capability === null || capability === capabilitySnapshot) return
  capabilitySnapshot = capability
  if (!notify) return
  for (const listener of [...capabilityListeners]) {
    listener()
  }
}

function readCachedCapabilityOnce(): void {
  if (cachedCapabilityRead || typeof window === 'undefined') return
  cachedCapabilityRead = true
  // Called from getSnapshot as well, so update without notifying: the caller
  // is about to read the new snapshot anyway.
  applyCapability((window as NativeDeviceAudioWindow)[NATIVE_SHELL_CAPABILITIES_STATE_KEY], false)
}

export function subscribeNativeDeviceAudioCapability(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {}

  capabilityListeners.add(listener)
  if (!detachCapabilityListener) {
    const handleCapabilities = (event: Event) => {
      applyCapability((event as CustomEvent<unknown>).detail, true)
    }
    window.addEventListener(NATIVE_SHELL_CAPABILITIES_EVENT, handleCapabilities)
    detachCapabilityListener = () => {
      window.removeEventListener(NATIVE_SHELL_CAPABILITIES_EVENT, handleCapabilities)
    }
    const before = capabilitySnapshot
    readCachedCapabilityOnce()
    if (capabilitySnapshot !== before) listener()
  }

  return () => {
    capabilityListeners.delete(listener)
    if (capabilityListeners.size === 0 && detachCapabilityListener) {
      detachCapabilityListener()
      detachCapabilityListener = null
      // Re-read the late-reader cache on the next subscription: a message
      // that arrives while nobody listens still lands there.
      cachedCapabilityRead = false
    }
  }
}

export function getNativeDeviceAudioCapabilitySnapshot(): boolean {
  readCachedCapabilityOnce()
  return capabilitySnapshot
}

export function getNativeDeviceAudioCapabilityServerSnapshot(): boolean {
  return false
}

// ── Capture-source pick (in memory, shared by every mounted room) ──────────

let pickSnapshot: SttCaptureSource = 'microphone'
const pickListeners = new Set<() => void>()

export function subscribeSttCaptureSourcePick(listener: () => void): () => void {
  pickListeners.add(listener)
  return () => {
    pickListeners.delete(listener)
  }
}

export function getSttCaptureSourcePickSnapshot(): SttCaptureSource {
  return pickSnapshot
}

export function getSttCaptureSourcePickServerSnapshot(): SttCaptureSource {
  return 'microphone'
}

export function setSttCaptureSourcePick(next: SttCaptureSource): void {
  if (pickSnapshot === next) return
  pickSnapshot = next
  for (const listener of [...pickListeners]) {
    listener()
  }
}

export function resetNativeDeviceAudioStoresForTests(): void {
  detachCapabilityListener?.()
  detachCapabilityListener = null
  capabilityListeners.clear()
  capabilitySnapshot = false
  cachedCapabilityRead = false
  pickListeners.clear()
  pickSnapshot = 'microphone'
}

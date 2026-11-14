// Which microphone live STT records from while earphones are in.
//
// An earphone microphone hears its wearer only: the person being translated,
// who talks toward the phone, comes in faint or not at all. So a shell that
// reports `earphoneMicrophoneChoice: true` in its `capabilities` message
// records from the phone's microphone while earphones are in. The earphones'
// microphone can be picked instead from the room menu or my page (never asked
// unprompted). The pick is kept per device.

import {
  NATIVE_SHELL_CAPABILITIES_EVENT,
  NATIVE_SHELL_CAPABILITIES_STATE_KEY,
} from './native-device-audio'

export type EarphoneMicrophonePick = 'phone' | 'earphone'

export const EARPHONE_MICROPHONE_PICK_STORAGE_KEY = 'mingle_earphone_microphone_pick'

// The pick the question starts on, and what a shell uses before it is asked.
export const DEFAULT_EARPHONE_MICROPHONE_PICK: EarphoneMicrophonePick = 'phone'

// null = not a capabilities message; otherwise the shell's flag. Older shells
// send a capabilities message without it.
export function parseNativeEarphoneMicrophoneChoiceCapability(detail: unknown): boolean | null {
  if (typeof detail !== 'object' || detail === null || Array.isArray(detail)) return null
  const record = detail as Record<string, unknown>
  if (record.type !== 'capabilities') return null
  return record.earphoneMicrophoneChoice === true
}

export function parseEarphoneMicrophonePick(raw: unknown): EarphoneMicrophonePick | null {
  return raw === 'phone' || raw === 'earphone' ? raw : null
}

export const EARPHONE_LISTENING_NOTICE_STORAGE_KEY = 'mingle_earphone_listening_notice_shown'

export type EarphoneListeningNotice = {
  open: boolean
  // "The earphones only play; the phone's microphone listens", with Change.
  showMicrophone: boolean
  // Other apps' sound left the microphone's reach: translate it directly?
  showCaptureSource: boolean
}

// One modal, once ever, the first time STT listens with earphones in (it
// started with them in, or they went in while listening). Never while STT is
// off. Each part shows only when it applies; with neither, nothing opens.
export function resolveEarphoneListeningNotice(input: {
  visible: boolean
  earphonesConnected: boolean
  sessionRunning: boolean
  shown: boolean
  microphoneChoiceCapable: boolean
  microphonePick: EarphoneMicrophonePick | null
  deviceAudioSupported: boolean
  captureSource: 'microphone' | 'device_audio'
}): EarphoneListeningNotice {
  const showMicrophone = input.microphoneChoiceCapable && input.microphonePick !== 'earphone'
  const showCaptureSource = input.deviceAudioSupported && input.captureSource === 'microphone'
  const open = input.visible
    && input.earphonesConnected
    && input.sessionRunning
    && !input.shown
    && (showMicrophone || showCaptureSource)
  return { open, showMicrophone, showCaptureSource }
}

export function readEarphoneListeningNoticeShown(storage?: Pick<Storage, 'getItem'> | null): boolean {
  try {
    const target = storage ?? (typeof window === 'undefined' ? null : window.localStorage)
    return target?.getItem(EARPHONE_LISTENING_NOTICE_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function writeEarphoneListeningNoticeShown(storage?: Pick<Storage, 'setItem'> | null): void {
  try {
    const target = storage ?? (typeof window === 'undefined' ? null : window.localStorage)
    target?.setItem(EARPHONE_LISTENING_NOTICE_STORAGE_KEY, '1')
  } catch {
    // Private mode: the notice may show again next time.
  }
}

// The `earphoneMicrophone` start option: only an explicit earphone pick.
export function resolveEarphoneMicrophoneEnabled(pick: EarphoneMicrophonePick | null): boolean {
  return pick === 'earphone'
}

// ── Capability store (one per window, shared by every mounted room) ────────

type NativeShellWindow = Window & {
  [NATIVE_SHELL_CAPABILITIES_STATE_KEY]?: unknown
}

let capabilitySnapshot = false
let cachedCapabilityRead = false
const capabilityListeners = new Set<() => void>()
let detachCapabilityListener: (() => void) | null = null

function applyCapability(detail: unknown, notify: boolean): void {
  const capability = parseNativeEarphoneMicrophoneChoiceCapability(detail)
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
  applyCapability((window as NativeShellWindow)[NATIVE_SHELL_CAPABILITIES_STATE_KEY], false)
}

export function subscribeNativeEarphoneMicrophoneCapability(listener: () => void): () => void {
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
      cachedCapabilityRead = false
    }
  }
}

export function getNativeEarphoneMicrophoneCapabilitySnapshot(): boolean {
  readCachedCapabilityOnce()
  return capabilitySnapshot
}

export function getNativeEarphoneMicrophoneCapabilityServerSnapshot(): boolean {
  return false
}

// ── Pick store (localStorage, shared by every mounted room) ────────────────

type PickStorage = Pick<Storage, 'getItem' | 'setItem'>

function resolveStorage(storage?: PickStorage | null): PickStorage | null {
  if (storage) return storage
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function readEarphoneMicrophonePick(storage?: PickStorage | null): EarphoneMicrophonePick | null {
  try {
    return parseEarphoneMicrophonePick(resolveStorage(storage)?.getItem(EARPHONE_MICROPHONE_PICK_STORAGE_KEY))
  } catch {
    return null
  }
}

let pickSnapshot: EarphoneMicrophonePick | null = null
let pickSnapshotRead = false
const pickListeners = new Set<() => void>()
let detachStorageListener: (() => void) | null = null

function notifyPickListeners(): void {
  for (const listener of [...pickListeners]) {
    listener()
  }
}

export function subscribeEarphoneMicrophonePick(listener: () => void): () => void {
  pickListeners.add(listener)
  if (!detachStorageListener && typeof window !== 'undefined') {
    // Another tab answered the question.
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== EARPHONE_MICROPHONE_PICK_STORAGE_KEY) return
      const next = parseEarphoneMicrophonePick(event.newValue)
      if (next === pickSnapshot) return
      pickSnapshot = next
      pickSnapshotRead = true
      notifyPickListeners()
    }
    window.addEventListener('storage', handleStorage)
    detachStorageListener = () => window.removeEventListener('storage', handleStorage)
  }
  return () => {
    pickListeners.delete(listener)
    if (pickListeners.size === 0 && detachStorageListener) {
      detachStorageListener()
      detachStorageListener = null
    }
  }
}

export function getEarphoneMicrophonePickSnapshot(): EarphoneMicrophonePick | null {
  if (!pickSnapshotRead) {
    pickSnapshotRead = true
    pickSnapshot = readEarphoneMicrophonePick()
  }
  return pickSnapshot
}

export function getEarphoneMicrophonePickServerSnapshot(): EarphoneMicrophonePick | null {
  return null
}

export function writeEarphoneMicrophonePick(
  next: EarphoneMicrophonePick,
  storage?: PickStorage | null,
): void {
  try {
    resolveStorage(storage)?.setItem(EARPHONE_MICROPHONE_PICK_STORAGE_KEY, next)
  } catch {
    // Private mode or blocked storage: the pick still holds for this page.
  }
  pickSnapshotRead = true
  if (pickSnapshot === next) return
  pickSnapshot = next
  notifyPickListeners()
}

export function resetNativeEarphoneMicrophoneStoresForTests(): void {
  detachCapabilityListener?.()
  detachCapabilityListener = null
  capabilityListeners.clear()
  capabilitySnapshot = false
  cachedCapabilityRead = false
  detachStorageListener?.()
  detachStorageListener = null
  pickListeners.clear()
  pickSnapshot = null
  pickSnapshotRead = false
}

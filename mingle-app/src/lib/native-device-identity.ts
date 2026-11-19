// One account per person (docs/one-account-per-person.md): the app shell
// tells the page which phone this is, and the page passes it on to the server
// in two request headers. The value is a random id kept in the iOS keychain
// ('keychain') or Android's ANDROID_ID ('android_id'); both survive a
// reinstall. A browser, or an app from before this was added, has no value
// and sends no header: the server then goes by number and sign-in method only.
//
// The shell puts the value in its `capabilities` message at every WebView
// load end (rn/src/nativeCapabilities.ts) and keeps the last message on the
// window. A request made right at page start can be earlier than that
// message, so waitForNativeDeviceIdentity waits a moment for it inside the app.

import { NATIVE_SHELL_CAPABILITIES_EVENT, NATIVE_SHELL_CAPABILITIES_STATE_KEY } from '@/lib/native-device-audio'

export type NativeDeviceKind = 'keychain' | 'android_id'
export type NativeDeviceIdentity = { deviceId: string; deviceKind: NativeDeviceKind }

export const DEVICE_ID_HEADER = 'x-mingle-device-id'
export const DEVICE_KIND_HEADER = 'x-mingle-device-kind'
export const CLIENT_PLATFORM_HEADER = 'x-mingle-client-platform'

const WAIT_FOR_SHELL_MS = 2_000

type DeviceIdentityWindow = Window & {
  ReactNativeWebView?: { postMessage?: (message: string) => void }
  [NATIVE_SHELL_CAPABILITIES_STATE_KEY]?: unknown
}

function isCapabilitiesMessage(detail: unknown): detail is Record<string, unknown> {
  return typeof detail === 'object' && detail !== null && !Array.isArray(detail)
    && (detail as Record<string, unknown>).type === 'capabilities'
}

/** The device value in a capabilities message, or null (not that message, an older shell, or a value the server would not take). */
export function parseNativeDeviceIdentity(detail: unknown): NativeDeviceIdentity | null {
  if (!isCapabilitiesMessage(detail)) return null
  const deviceId = typeof detail.deviceId === 'string' ? detail.deviceId.trim() : ''
  if (deviceId.length < 8 || deviceId.length > 128) return null
  const deviceKind = detail.deviceKind
  if (deviceKind !== 'keychain' && deviceKind !== 'android_id') return null
  return { deviceId, deviceKind }
}

/** The two device headers, plus the platform the kind implies. Empty without a device value. */
export function buildDeviceIdentityHeaders(identity: NativeDeviceIdentity | null): Record<string, string> {
  if (!identity) return {}
  return {
    [DEVICE_ID_HEADER]: identity.deviceId,
    [DEVICE_KIND_HEADER]: identity.deviceKind,
    [CLIENT_PLATFORM_HEADER]: identity.deviceKind === 'keychain' ? 'ios' : 'android',
  }
}

/** The device value the shell has sent so far, or null. */
export function readNativeDeviceIdentity(): NativeDeviceIdentity | null {
  if (typeof window === 'undefined') return null
  return parseNativeDeviceIdentity((window as DeviceIdentityWindow)[NATIVE_SHELL_CAPABILITIES_STATE_KEY])
}

/**
 * The device value, waiting up to `timeoutMs` for the shell's capabilities
 * message when the page runs inside the app and the message has not arrived.
 * Resolves null at once in a browser, and as soon as a capabilities message
 * without a device value arrives (an older app).
 */
export function waitForNativeDeviceIdentity(timeoutMs: number = WAIT_FOR_SHELL_MS): Promise<NativeDeviceIdentity | null> {
  if (typeof window === 'undefined') return Promise.resolve(null)
  const nativeWindow = window as DeviceIdentityWindow
  if (isCapabilitiesMessage(nativeWindow[NATIVE_SHELL_CAPABILITIES_STATE_KEY])) return Promise.resolve(readNativeDeviceIdentity())
  if (typeof nativeWindow.ReactNativeWebView?.postMessage !== 'function') return Promise.resolve(null)
  return new Promise((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      window.removeEventListener(NATIVE_SHELL_CAPABILITIES_EVENT, onMessage)
      resolve(readNativeDeviceIdentity())
    }
    const onMessage = (event: Event) => {
      if (isCapabilitiesMessage((event as CustomEvent).detail) || isCapabilitiesMessage(nativeWindow[NATIVE_SHELL_CAPABILITIES_STATE_KEY])) finish()
    }
    const timer = window.setTimeout(finish, timeoutMs)
    window.addEventListener(NATIVE_SHELL_CAPABILITIES_EVENT, onMessage)
  })
}

/** Headers for a request the one-account rules read (/account/access, phone code check). Never rejects. */
export async function resolveDeviceIdentityHeaders(timeoutMs?: number): Promise<Record<string, string>> {
  try {
    return buildDeviceIdentityHeaders(await waitForNativeDeviceIdentity(timeoutMs))
  } catch {
    return {}
  }
}

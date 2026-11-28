import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NATIVE_SHELL_CAPABILITIES_EVENT, NATIVE_SHELL_CAPABILITIES_STATE_KEY } from '@/lib/native-device-audio'
import {
  buildDeviceIdentityHeaders,
  parseNativeDeviceIdentity,
  readNativeDeviceIdentity,
  resolveDeviceIdentityHeaders,
  waitForNativeDeviceIdentity,
} from './native-device-identity'

type TestWindow = EventTarget & {
  ReactNativeWebView?: unknown
  [NATIVE_SHELL_CAPABILITIES_STATE_KEY]?: unknown
  setTimeout: typeof setTimeout
  clearTimeout: typeof clearTimeout
}
let testWindow: TestWindow
const ios = { type: 'capabilities', openAppSettings: true, deviceId: '0f8fad5b-d9cb-469f-a165-70867728950e', deviceKind: 'keychain' }

function insideApp() {
  testWindow.ReactNativeWebView = { postMessage: () => undefined }
}

function shellSends(message: unknown) {
  testWindow[NATIVE_SHELL_CAPABILITIES_STATE_KEY] = message
  testWindow.dispatchEvent(new CustomEvent(NATIVE_SHELL_CAPABILITIES_EVENT, { detail: message }))
}

// No DOM in these tests: a bare event target stands in for the page's window.
beforeEach(() => {
  testWindow = Object.assign(new EventTarget(), {
    setTimeout: ((...args: Parameters<typeof setTimeout>) => setTimeout(...args)) as typeof setTimeout,
    clearTimeout: ((id: Parameters<typeof clearTimeout>[0]) => clearTimeout(id)) as typeof clearTimeout,
  })
  vi.stubGlobal('window', testWindow)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('parseNativeDeviceIdentity', () => {
  it('reads the keychain id and ANDROID_ID from the capabilities message', () => {
    expect(parseNativeDeviceIdentity(ios)).toEqual({ deviceId: ios.deviceId, deviceKind: 'keychain' })
    expect(parseNativeDeviceIdentity({ type: 'capabilities', deviceId: ' a1b2c3d4e5f60718 ', deviceKind: 'android_id' }))
      .toEqual({ deviceId: 'a1b2c3d4e5f60718', deviceKind: 'android_id' })
  })

  it('takes nothing from an older shell, another message, or a value the server would refuse', () => {
    expect(parseNativeDeviceIdentity({ type: 'capabilities', contacts: true })).toBeNull()
    expect(parseNativeDeviceIdentity({ type: 'status', deviceId: ios.deviceId, deviceKind: 'keychain' })).toBeNull()
    expect(parseNativeDeviceIdentity({ type: 'capabilities', deviceId: 'short', deviceKind: 'keychain' })).toBeNull()
    expect(parseNativeDeviceIdentity({ type: 'capabilities', deviceId: 'x'.repeat(129), deviceKind: 'keychain' })).toBeNull()
    expect(parseNativeDeviceIdentity({ type: 'capabilities', deviceId: ios.deviceId, deviceKind: 'idfa' })).toBeNull()
    expect(parseNativeDeviceIdentity(null)).toBeNull()
  })
})

describe('buildDeviceIdentityHeaders', () => {
  it('sends the id, its kind and the platform the kind implies', () => {
    expect(buildDeviceIdentityHeaders({ deviceId: ios.deviceId, deviceKind: 'keychain' })).toEqual({
      'x-mingle-device-id': ios.deviceId,
      'x-mingle-device-kind': 'keychain',
      'x-mingle-client-platform': 'ios',
    })
    expect(buildDeviceIdentityHeaders({ deviceId: 'a1b2c3d4e5f60718', deviceKind: 'android_id' })['x-mingle-client-platform']).toBe('android')
  })

  it('sends no header without a device value', () => {
    expect(buildDeviceIdentityHeaders(null)).toEqual({})
  })
})

describe('waitForNativeDeviceIdentity', () => {
  it('answers at once in a browser: no value, no waiting', async () => {
    await expect(waitForNativeDeviceIdentity()).resolves.toBeNull()
    await expect(resolveDeviceIdentityHeaders()).resolves.toEqual({})
  })

  it('reads the value the shell already sent', async () => {
    insideApp()
    testWindow[NATIVE_SHELL_CAPABILITIES_STATE_KEY] = ios
    expect(readNativeDeviceIdentity()).toEqual({ deviceId: ios.deviceId, deviceKind: 'keychain' })
    await expect(resolveDeviceIdentityHeaders()).resolves.toMatchObject({ 'x-mingle-device-id': ios.deviceId })
  })

  it('waits for the capabilities message when a request is earlier than it', async () => {
    insideApp()
    const pending = waitForNativeDeviceIdentity(5_000)
    shellSends({ type: 'status', status: 'idle' })
    shellSends(ios)
    await expect(pending).resolves.toEqual({ deviceId: ios.deviceId, deviceKind: 'keychain' })
  })

  it('stops waiting as soon as an older shell answers without a value', async () => {
    insideApp()
    const pending = waitForNativeDeviceIdentity(5_000)
    shellSends({ type: 'capabilities', openAppSettings: true })
    await expect(pending).resolves.toBeNull()
  })

  it('gives up after the timeout and sends no header', async () => {
    vi.useFakeTimers()
    insideApp()
    const pending = resolveDeviceIdentityHeaders(2_000)
    await vi.advanceTimersByTimeAsync(2_000)
    await expect(pending).resolves.toEqual({})
  })
})

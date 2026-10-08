import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  NATIVE_SHELL_CAPABILITIES_EVENT,
  NATIVE_SHELL_CAPABILITIES_STATE_KEY,
  getNativeDeviceAudioCapabilitySnapshot,
  getSttCaptureSourcePickSnapshot,
  parseNativeDeviceAudioCapability,
  resetNativeDeviceAudioStoresForTests,
  resolveEffectiveSttCaptureSource,
  setSttCaptureSourcePick,
  subscribeNativeDeviceAudioCapability,
  subscribeSttCaptureSourcePick,
} from './native-device-audio'

describe('capability detection', () => {
  it('reads deviceAudioCapture from the capabilities message; old shells report none', () => {
    expect(parseNativeDeviceAudioCapability({ type: 'capabilities', openAppSettings: true, audioRoute: true, deviceAudioCapture: true })).toBe(true)
    expect(parseNativeDeviceAudioCapability({ type: 'capabilities', openAppSettings: true, audioRoute: true })).toBe(false)
    expect(parseNativeDeviceAudioCapability({ type: 'capabilities', deviceAudioCapture: 'true' })).toBe(false)
    expect(parseNativeDeviceAudioCapability({ type: 'status', status: 'ready' })).toBeNull()
    expect(parseNativeDeviceAudioCapability(null)).toBeNull()
    expect(parseNativeDeviceAudioCapability([])).toBeNull()
  })
})

describe('effective capture source', () => {
  it('captures device audio only when the shell can, earphone mode is on and it was picked', () => {
    expect(resolveEffectiveSttCaptureSource({ supported: true, earphoneModeEnabled: true, pick: 'device_audio' })).toBe('device_audio')
    expect(resolveEffectiveSttCaptureSource({ supported: false, earphoneModeEnabled: true, pick: 'device_audio' })).toBe('microphone')
    expect(resolveEffectiveSttCaptureSource({ supported: true, earphoneModeEnabled: false, pick: 'device_audio' })).toBe('microphone')
    expect(resolveEffectiveSttCaptureSource({ supported: true, earphoneModeEnabled: true, pick: 'microphone' })).toBe('microphone')
  })
})

describe('page-wide stores', () => {
  let target: EventTarget & Record<string, unknown>

  beforeEach(() => {
    resetNativeDeviceAudioStoresForTests()
    target = new EventTarget() as EventTarget & Record<string, unknown>
    vi.stubGlobal('window', target)
  })

  afterEach(() => {
    resetNativeDeviceAudioStoresForTests()
    vi.unstubAllGlobals()
  })

  it('is unsupported until the shell says otherwise', () => {
    expect(getNativeDeviceAudioCapabilitySnapshot()).toBe(false)
  })

  it('reads the late-reader cache a room finds when it mounts after load end', () => {
    target[NATIVE_SHELL_CAPABILITIES_STATE_KEY] = { type: 'capabilities', openAppSettings: true, audioRoute: true, deviceAudioCapture: true }
    expect(getNativeDeviceAudioCapabilitySnapshot()).toBe(true)
  })

  it('follows live capabilities messages and notifies subscribers once per change', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeNativeDeviceAudioCapability(listener)

    target.dispatchEvent(new CustomEvent(NATIVE_SHELL_CAPABILITIES_EVENT, {
      detail: { type: 'capabilities', openAppSettings: true, audioRoute: true, deviceAudioCapture: true },
    }))
    expect(getNativeDeviceAudioCapabilitySnapshot()).toBe(true)
    // Other traffic on the shared channel, and a repeat, change nothing.
    target.dispatchEvent(new CustomEvent(NATIVE_SHELL_CAPABILITIES_EVENT, { detail: { type: 'status', status: 'ready' } }))
    target.dispatchEvent(new CustomEvent(NATIVE_SHELL_CAPABILITIES_EVENT, {
      detail: { type: 'capabilities', openAppSettings: true, audioRoute: true, deviceAudioCapture: true },
    }))
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    target.dispatchEvent(new CustomEvent(NATIVE_SHELL_CAPABILITIES_EVENT, {
      detail: { type: 'capabilities', openAppSettings: true, audioRoute: true },
    }))
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('starts every page on the microphone and shares one pick across rooms', () => {
    expect(getSttCaptureSourcePickSnapshot()).toBe('microphone')
    const first = vi.fn()
    const second = vi.fn()
    const unsubscribeFirst = subscribeSttCaptureSourcePick(first)
    subscribeSttCaptureSourcePick(second)

    setSttCaptureSourcePick('device_audio')
    setSttCaptureSourcePick('device_audio')
    expect(getSttCaptureSourcePickSnapshot()).toBe('device_audio')
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)

    unsubscribeFirst()
    setSttCaptureSourcePick('microphone')
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(2)
  })
})

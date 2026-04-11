import { describe, expect, it } from 'vitest'

import {
  resolveConnectionStatusFromNativeBridgeStatus,
  shouldPromoteConnectionStatusFromNativeActivity,
} from './use-realtime-stt'

describe('Android native STT reconcile contracts', () => {
  it('maps restored Android native bridge statuses back into the running UI state', () => {
    expect(resolveConnectionStatusFromNativeBridgeStatus({
      nativeStatus: 'running',
      previousConnectionStatus: 'idle',
    })).toBe('ready')

    expect(resolveConnectionStatusFromNativeBridgeStatus({
      nativeStatus: 'silenced',
      previousConnectionStatus: 'idle',
    })).toBe('ready')
  })

  it('promotes Android native transcript activity back into ready after remount or background gaps', () => {
    expect(shouldPromoteConnectionStatusFromNativeActivity({
      previousConnectionStatus: 'idle',
    })).toBe(true)

    expect(shouldPromoteConnectionStatusFromNativeActivity({
      previousConnectionStatus: 'connecting',
    })).toBe(true)

    expect(shouldPromoteConnectionStatusFromNativeActivity({
      previousConnectionStatus: 'error',
    })).toBe(true)
  })

  it('does not re-promote Android native activity once the UI is already running', () => {
    expect(shouldPromoteConnectionStatusFromNativeActivity({
      previousConnectionStatus: 'ready',
    })).toBe(false)
  })
})

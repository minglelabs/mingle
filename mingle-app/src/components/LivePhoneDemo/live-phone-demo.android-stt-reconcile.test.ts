import { describe, expect, it } from 'vitest'

import {
  resolveConnectionStatusFromNativeBridgeStatus,
  shouldRunNativeConnectingWatchdog,
  shouldTakeOverNativeSttOwnerForMessage,
  shouldPromoteConnectionStatusFromNativeActivity,
} from './use-realtime-stt'

describe('Android native STT reconcile contracts', () => {
  it('maps restored Android native bridge statuses back into reconnecting state before transcript activity promotes ready', () => {
    expect(resolveConnectionStatusFromNativeBridgeStatus({
      nativeStatus: 'running',
      previousConnectionStatus: 'idle',
    })).toBe('connecting')

    expect(resolveConnectionStatusFromNativeBridgeStatus({
      nativeStatus: 'silenced',
      previousConnectionStatus: 'idle',
    })).toBe('connecting')

    expect(resolveConnectionStatusFromNativeBridgeStatus({
      nativeStatus: 'running',
      previousConnectionStatus: 'ready',
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

  it('reclaims a stale native owner only for an explicitly matching room message', () => {
    expect(shouldTakeOverNativeSttOwnerForMessage({
      hasActiveOwner: true,
      isCurrentOwner: false,
      messageConversationId: 'room-a',
      currentConversationId: 'room-a',
    })).toBe(true)

    expect(shouldTakeOverNativeSttOwnerForMessage({
      hasActiveOwner: true,
      isCurrentOwner: false,
      messageConversationId: 'room-b',
      currentConversationId: 'room-a',
    })).toBe(false)

    expect(shouldTakeOverNativeSttOwnerForMessage({
      hasActiveOwner: true,
      isCurrentOwner: false,
      currentConversationId: 'room-a',
    })).toBe(false)
  })

  it('runs the connecting watchdog only for the active native owner', () => {
    expect(shouldRunNativeConnectingWatchdog({
      connectionStatus: 'connecting',
      useNativeStt: true,
      isCurrentOwner: true,
    })).toBe(true)

    expect(shouldRunNativeConnectingWatchdog({
      connectionStatus: 'connecting',
      useNativeStt: true,
      isCurrentOwner: false,
    })).toBe(false)

    expect(shouldRunNativeConnectingWatchdog({
      connectionStatus: 'connecting',
      useNativeStt: true,
      isCurrentOwner: true,
      nativeStopRequested: true,
    })).toBe(false)

    expect(shouldRunNativeConnectingWatchdog({
      connectionStatus: 'ready',
      useNativeStt: true,
      isCurrentOwner: true,
    })).toBe(false)
  })
})

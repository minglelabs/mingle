import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  parseNativePipEvent,
  postNativePipCommand,
  supportsNativePipNamespace,
  type NativePipCommand,
} from './native-pip'

const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window')

function setTestWindow(value: unknown) {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value,
    writable: true,
  })
}

afterEach(() => {
  if (originalWindowDescriptor) {
    Object.defineProperty(globalThis, 'window', originalWindowDescriptor)
  } else {
    Reflect.deleteProperty(globalThis, 'window')
  }
})

describe('native Picture in Picture bridge', () => {
  it.each([
    ['ios/v1.1.4', false],
    ['ios/v2.0.0', false],
    ['ios/v2.0.1', false],
    ['ios/v2.0.2', true],
    ['ios/v2.0.3', true],
    ['ios/v2.1.0', true],
    ['android/v2.0.0', false],
    ['android/v2.0.1', false],
    ['android/v2.0.2', false],
    ['', false],
    ['ios/vunknown', false],
    ['/ios/v2.0.2/', true],
    ['ios%2Fv2.0.2', true],
  ])('only exposes PiP for a native namespace that implements it: %s', (namespace, expected) => {
    expect(supportsNativePipNamespace(namespace)).toBe(expected)
  })

  it('serializes a command through the React Native WebView bridge', () => {
    const postMessage = vi.fn()
    setTestWindow({ ReactNativeWebView: { postMessage } })

    const command: NativePipCommand = {
      type: 'native_pip_update',
      payload: {
        conversationId: 'conversation-1',
        displayMode: 'collapsed',
        emptyLabel: 'No messages yet.',
        messages: [],
      },
    }

    expect(postNativePipCommand(command)).toBe(true)
    expect(postMessage).toHaveBeenCalledWith(JSON.stringify(command))
  })

  it('parses lifecycle and playback events from the native bridge', () => {
    expect(parseNativePipEvent({
      type: 'started',
      conversationId: ' conversation-1 ',
    })).toEqual({ type: 'started', conversationId: 'conversation-1' })
    expect(parseNativePipEvent({
      type: 'playback_control',
      conversationId: 'conversation-1',
      playing: false,
    })).toEqual({
      type: 'playback_control',
      conversationId: 'conversation-1',
      playing: false,
    })
    expect(parseNativePipEvent({ type: 'playback_control', playing: true })).toBeNull()
  })

  it('returns false when the native bridge is unavailable or throws', () => {
    setTestWindow({})
    expect(postNativePipCommand({
      type: 'native_pip_stop',
      payload: { conversationId: 'conversation-1' },
    })).toBe(false)

    const postMessage = vi.fn(() => {
      throw new Error('bridge closed')
    })
    setTestWindow({ ReactNativeWebView: { postMessage } })
    expect(postNativePipCommand({
      type: 'native_pip_stop',
      payload: { conversationId: 'conversation-1' },
    })).toBe(false)
  })
})

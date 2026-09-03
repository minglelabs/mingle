import { afterEach, describe, expect, it, vi } from 'vitest'

import { postNativePipCommand, type NativePipCommand } from './native-pip'

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
  it('serializes a command through the React Native WebView bridge', () => {
    const postMessage = vi.fn()
    setTestWindow({ ReactNativeWebView: { postMessage } })

    const command: NativePipCommand = {
      type: 'native_pip_update',
      payload: {
        conversationId: 'conversation-1',
        displayMode: 'collapsed',
        title: 'Test room',
        statusLabel: 'Live',
        emptyLabel: 'No messages yet.',
        messages: [],
      },
    }

    expect(postNativePipCommand(command)).toBe(true)
    expect(postMessage).toHaveBeenCalledWith(JSON.stringify(command))
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

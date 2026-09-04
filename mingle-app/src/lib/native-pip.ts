export type NativePipTranslation = {
  language: string
  text: string
  isInterim?: boolean
}

export type NativePipMessage = {
  id: string
  text: string
  originalText: string
  originalLanguage: string
  displayLanguage: string
  translations: NativePipTranslation[]
  isOwn?: boolean
  isInterim?: boolean
}

export type NativePipState = {
  conversationId: string
  displayMode: 'expanded' | 'collapsed'
  emptyLabel: string
  messages: NativePipMessage[]
}

export type NativePipCommand =
  | {
      type: 'native_pip_start'
      payload: NativePipState
    }
  | {
      type: 'native_pip_update'
      payload: NativePipState
    }
  | {
      type: 'native_pip_playback_state'
      payload: { conversationId: string, playing: boolean }
    }
  | {
      type: 'native_pip_stop'
      payload: { conversationId: string }
    }

export const NATIVE_PIP_WEB_EVENT = 'mingle:native-pip'
export const NATIVE_PIP_WEB_STATE_KEY = '__MINGLE_LAST_NATIVE_PIP_EVENT'

export type NativePipEvent =
  | { type: 'started', conversationId: string }
  | { type: 'stopped', conversationId?: string }
  | { type: 'failed', conversationId?: string, message?: string }
  | { type: 'playback_control', conversationId: string, playing: boolean }

export function parseNativePipEvent(value: unknown): NativePipEvent | null {
  if (!value || typeof value !== 'object') return null

  const record = value as Record<string, unknown>
  const type = typeof record.type === 'string' ? record.type : ''
  const conversationId = typeof record.conversationId === 'string'
    ? record.conversationId.trim()
    : ''

  if (type === 'started' && conversationId) {
    return { type, conversationId }
  }
  if (type === 'stopped' || type === 'failed') {
    const message = typeof record.message === 'string' ? record.message.trim() : ''
    return {
      type,
      ...(conversationId ? { conversationId } : {}),
      ...(message ? { message } : {}),
    }
  }
  if (type === 'playback_control' && conversationId && typeof record.playing === 'boolean') {
    return { type, conversationId, playing: record.playing }
  }

  return null
}

type NativePipBridgeWindow = Window & {
  ReactNativeWebView?: {
    postMessage?: (message: string) => void
  }
}

export function postNativePipCommand(command: NativePipCommand): boolean {
  if (typeof window === 'undefined') return false

  const bridgeWindow = window as NativePipBridgeWindow
  if (typeof bridgeWindow.ReactNativeWebView?.postMessage !== 'function') return false

  try {
    bridgeWindow.ReactNativeWebView.postMessage(JSON.stringify(command))
    return true
  } catch {
    // PiP is an enhancement; a bridge failure must not interrupt the room.
    return false
  }
}

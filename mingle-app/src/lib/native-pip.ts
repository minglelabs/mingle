export type NativePipMessage = {
  id: string
  speaker?: string
  text: string
  isInterim?: boolean
}

export type NativePipState = {
  conversationId: string
  displayMode: 'expanded' | 'collapsed'
  title: string
  statusLabel: string
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
      type: 'native_pip_stop'
      payload: { conversationId: string }
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

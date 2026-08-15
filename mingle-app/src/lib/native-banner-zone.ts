export type NativeBannerZone = 'list' | 'conversation' | 'hidden'

export const NATIVE_AUTH_BANNER_STATE_FIXED_BUILD = 68

export function shouldReassertNativeAuthBannerZone(clientBuild: string | null): boolean {
  const normalized = clientBuild?.trim() || ''
  if (!/^\d+$/.test(normalized)) return true
  return Number(normalized) < NATIVE_AUTH_BANNER_STATE_FIXED_BUILD
}

export function resolveConversationListNativeBannerZone(params: {
  isAuthenticated: boolean
  hasActiveConversation: boolean
  isSearchOpen: boolean
}): NativeBannerZone {
  if (!params.isAuthenticated || params.hasActiveConversation || params.isSearchOpen) {
    return 'hidden'
  }

  return 'list'
}

type NativeBannerZoneBridgeWindow = Window & {
  ReactNativeWebView?: {
    postMessage?: (message: string) => void
  }
}

type NativeSetBannerZoneCommand = {
  type: 'native_set_banner_zone'
  payload: {
    zone: NativeBannerZone
  }
}

export function postNativeBannerZone(zone: NativeBannerZone): void {
  if (typeof window === 'undefined') return

  const bridgeWindow = window as NativeBannerZoneBridgeWindow
  if (typeof bridgeWindow.ReactNativeWebView?.postMessage !== 'function') return

  const command: NativeSetBannerZoneCommand = {
    type: 'native_set_banner_zone',
    payload: { zone },
  }

  try {
    bridgeWindow.ReactNativeWebView.postMessage(JSON.stringify(command))
  } catch {
    // Ignore bridge errors and leave the native banner zone unchanged.
  }
}

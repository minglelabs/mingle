export type NativeBannerZone = 'list' | 'conversation'

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

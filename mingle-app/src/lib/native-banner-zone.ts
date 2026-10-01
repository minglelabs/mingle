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
  isListOverlayOpen?: boolean
}): NativeBannerZone {
  if (
    !params.isAuthenticated
    || params.hasActiveConversation
    || params.isSearchOpen
    || params.isListOverlayOpen
  ) {
    return 'hidden'
  }

  return 'list'
}

// ---------------------------------------------------------------------------
// Banner visibility policy
//
// The native AdMob banner is an allow-list, not a deny-list: it may only be
// visible on the conversation list and inside a chat room. Everything else —
// every other route, and every overlay/modal layered over those two screens —
// is banner-free by default, so a new screen needs no banner code at all.
//
// All `native_set_banner_zone` traffic goes through this module. The zone sent
// to the native shell is the intersection of three gates:
//   1. route:        the current page must be `/{locale}/conversations`;
//   2. surface:      the list / room asked for 'list' / 'conversation'
//                    (`requestNativeBannerZone`);
//   3. suppression:  no overlay currently holds `suppressNativeBanner()`.
// Call sites never decide what to restore when an overlay closes: releasing the
// suppression re-syncs the zone the surface last requested.
// ---------------------------------------------------------------------------

/** Only `/{locale}/conversations` hosts the list and the chat room overlay. Sub-routes such as `/conversations/new-group` are separate screens. */
export function isNativeBannerAllowedPathname(pathname: string): boolean {
  const segments = pathname.split('/').filter(Boolean)
  return segments.length === 2 && segments[1] === 'conversations'
}

export function resolveEffectiveNativeBannerZone(params: {
  requestedZone: NativeBannerZone
  pathname: string
  suppressionCount: number
}): NativeBannerZone {
  if (params.suppressionCount > 0) return 'hidden'
  if (!isNativeBannerAllowedPathname(params.pathname)) return 'hidden'
  return params.requestedZone
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

function postNativeBannerZoneCommand(zone: NativeBannerZone): void {
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

let requestedNativeBannerZone: NativeBannerZone = 'hidden'
const nativeBannerSuppressions = new Set<symbol>()

/**
 * Re-posts the effective zone. Every call posts (no de-duplication) because the
 * native shell can move its own zone on navigation, so the web side must be
 * able to reassert it.
 */
export function syncNativeBannerZone(): void {
  postNativeBannerZoneCommand(resolveEffectiveNativeBannerZone({
    requestedZone: requestedNativeBannerZone,
    pathname: typeof window === 'undefined' ? '' : window.location.pathname,
    suppressionCount: nativeBannerSuppressions.size,
  }))
}

/**
 * Called by the two banner-owning surfaces only (the conversation list and the
 * chat room) to say which zone they want. 'hidden' also serves as the "hide
 * now" signal for list/room transitions.
 */
export function requestNativeBannerZone(zone: NativeBannerZone): void {
  requestedNativeBannerZone = zone
  syncNativeBannerZone()
}

/**
 * Hides the banner until the returned release function is called. Holds are
 * counted, so stacked overlays release independently. Prefer
 * `useNativeBannerSuppression` inside components.
 */
export function suppressNativeBanner(): () => void {
  const token = Symbol('native-banner-suppression')
  nativeBannerSuppressions.add(token)
  syncNativeBannerZone()

  return () => {
    if (!nativeBannerSuppressions.delete(token)) return
    syncNativeBannerZone()
  }
}

/** Test-only: drops all module state between cases. */
export function resetNativeBannerZoneStateForTests(): void {
  requestedNativeBannerZone = 'hidden'
  nativeBannerSuppressions.clear()
}

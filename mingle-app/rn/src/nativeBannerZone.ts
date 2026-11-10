export type NativeBannerZone = 'list' | 'conversation' | 'hidden';

export type StableNativeBannerZone = Exclude<NativeBannerZone, 'hidden'>;

export type NativeBannerNavigationState = {
  activeZone: NativeBannerZone;
  stableZone: StableNativeBannerZone;
  pendingNavigationZone: NativeBannerZone | null;
};

export function resolveNativeBannerZoneForUrl(rawUrl: string): NativeBannerZone | null {
  if (!rawUrl) return null;

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    return null;
  }

  // Allow-list: only /{locale}/conversations hosts the list and the chat room.
  // Sub-routes such as /conversations/new-group are separate screens.
  const pathSegments = parsedUrl.pathname.split('/').filter(Boolean);
  if (pathSegments.length !== 2 || pathSegments[1] !== 'conversations') return 'hidden';

  return parsedUrl.searchParams.get('conversation') ? 'conversation' : 'list';
}

export function resolveNativeBannerNavigationState(
  current: NativeBannerNavigationState,
  rawUrl: string,
): NativeBannerNavigationState {
  const inferredZone = resolveNativeBannerZoneForUrl(rawUrl);
  if (!inferredZone) return current;

  // A screen that never shows a banner: hide and forget any pending restore.
  // The web re-requests the zone when it comes back to the list or a room, so
  // the shell must not put a banner back on its own after such a screen (the
  // app launches on the feed, and the list reached from it may be showing
  // onboarding or the sign-in gate).
  if (inferredZone === 'hidden') {
    if (current.activeZone === 'hidden' && current.pendingNavigationZone === null) return current;
    return {
      ...current,
      activeZone: 'hidden',
      pendingNavigationZone: null,
    };
  }

  if (inferredZone !== current.stableZone) {
    return {
      ...current,
      activeZone: 'hidden',
      pendingNavigationZone: inferredZone,
    };
  }

  // Restore the stable zone only when native navigation itself hid the banner
  // while a list <-> room transition settled. A zone the web asked for clears
  // the pending restore (see applyWebNativeBannerZoneRequest), so an explicit
  // "hidden" from the web is never undone here.
  if (current.activeZone === 'hidden' && current.pendingNavigationZone !== null) {
    return {
      ...current,
      activeZone: current.stableZone,
      pendingNavigationZone: null,
    };
  }

  return current;
}

/**
 * The web asked for a zone (`native_set_banner_zone`). The web is the authority
 * on banner visibility, so this always wins over a restore the shell had
 * pending from its own navigation tracking.
 */
export function applyWebNativeBannerZoneRequest(
  current: NativeBannerNavigationState,
  zone: NativeBannerZone,
): NativeBannerNavigationState {
  return {
    activeZone: zone,
    stableZone: zone === 'hidden' ? current.stableZone : zone,
    pendingNavigationZone: null,
  };
}

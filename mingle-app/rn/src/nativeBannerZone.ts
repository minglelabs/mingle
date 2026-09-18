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

  const pathSegments = parsedUrl.pathname.split('/').filter(Boolean);
  if (pathSegments.length < 2) return 'hidden';
  if (pathSegments[1] !== 'conversations') return 'hidden';

  return parsedUrl.searchParams.get('conversation') ? 'conversation' : 'list';
}

export function resolveNativeBannerNavigationState(
  current: NativeBannerNavigationState,
  rawUrl: string,
): NativeBannerNavigationState {
  const inferredZone = resolveNativeBannerZoneForUrl(rawUrl);
  if (!inferredZone) return current;

  if (inferredZone !== current.stableZone) {
    return {
      ...current,
      activeZone: 'hidden',
      pendingNavigationZone: inferredZone,
    };
  }

  // A hidden zone requested by the web authentication/search overlay is
  // authoritative. Restore the stable zone only when native navigation first
  // hid the banner while waiting for a different route to settle.
  if (current.activeZone === 'hidden' && current.pendingNavigationZone !== null) {
    return {
      ...current,
      activeZone: current.stableZone,
      pendingNavigationZone: null,
    };
  }

  return current;
}

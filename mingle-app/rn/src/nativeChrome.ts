function resolvePathname(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return "";

  try {
    return new URL(trimmed, "https://mingle.local").pathname;
  } catch {
    return "";
  }
}

function resolveSearchParams(rawUrl: string): URLSearchParams {
  try {
    return new URL(rawUrl, "https://mingle.local").searchParams;
  } catch {
    return new URLSearchParams();
  }
}

function isLocaleSegment(value: string | undefined): boolean {
  const normalized = (value || "").trim().toLowerCase();
  return /^[a-z]{2}(?:-[a-z]{2})?$/.test(normalized);
}

function resolveRouteSegments(rawUrl: string): string[] {
  const pathname = resolvePathname(rawUrl);
  if (!pathname || pathname === "/") return [];

  const segments = pathname
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length === 0) return [];

  if (isLocaleSegment(segments[0])) {
    return segments.slice(1);
  }

  return segments;
}

function matchesSingleRoute(rawUrl: string, route: string): boolean {
  const segments = resolveRouteSegments(rawUrl);
  return segments.length === 1 && segments[0] === route;
}

function hasConversationOverlayQuery(rawUrl: string): boolean {
  const value = (resolveSearchParams(rawUrl).get("conversation") || "").trim();
  return value.length > 0;
}

export function resolveForcedNativeBannerPositionForUrl(
  rawUrl: string,
): "bottom" | null {
  if (matchesSingleRoute(rawUrl, "conversations") && !hasConversationOverlayQuery(rawUrl)) {
    return "bottom";
  }
  if (matchesSingleRoute(rawUrl, "mypage")) return "bottom";
  return null;
}

export function shouldRequireNativeBannerSceneForUrl(rawUrl: string): boolean {
  if (matchesSingleRoute(rawUrl, "conversations")) return true;
  if (matchesSingleRoute(rawUrl, "mypage")) return true;
  return false;
}

export function shouldHideNativeBannerForUrl(rawUrl: string): boolean {
  if (matchesSingleRoute(rawUrl, "translator")) return false;
  if (matchesSingleRoute(rawUrl, "conversations") && hasConversationOverlayQuery(rawUrl)) {
    return false;
  }
  if (resolveForcedNativeBannerPositionForUrl(rawUrl)) return false;
  return true;
}

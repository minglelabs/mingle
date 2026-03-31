function resolvePathname(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return "";

  try {
    return new URL(trimmed, "https://mingle.local").pathname;
  } catch {
    return "";
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

export function resolveForcedNativeBannerPositionForUrl(
  rawUrl: string,
): "bottom" | null {
  if (matchesSingleRoute(rawUrl, "conversations")) return "bottom";
  if (matchesSingleRoute(rawUrl, "mypage")) return "bottom";
  return null;
}

export function shouldHideNativeBannerForUrl(rawUrl: string): boolean {
  if (matchesSingleRoute(rawUrl, "translator")) return false;
  if (resolveForcedNativeBannerPositionForUrl(rawUrl)) return false;
  return true;
}

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

export function shouldHideNativeBannerForUrl(rawUrl: string): boolean {
  const pathname = resolvePathname(rawUrl);
  if (!pathname || pathname === "/") return true;

  const segments = pathname
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length === 0) return true;

  if (segments[0] === "auth") return true;
  if (isLocaleSegment(segments[0]) && segments.length === 1) return true;
  if (isLocaleSegment(segments[0]) && segments[1] === "auth") return true;
  if (isLocaleSegment(segments[0]) && segments[1] === "translator") return true;

  return false;
}

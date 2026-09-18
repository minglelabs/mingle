const INSTAGRAM_HOST_SUFFIX = '.instagram.com';

function normalizeExternalNavigationUrl(rawUrl: string): string {
  return rawUrl.trim();
}

export function isInstagramWebUrl(rawUrl: string): boolean {
  const normalizedUrl = normalizeExternalNavigationUrl(rawUrl);
  if (!normalizedUrl) return false;

  try {
    const url = new URL(normalizedUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;

    const hostname = url.hostname.toLowerCase();
    return hostname === 'instagram.com' || hostname.endsWith(INSTAGRAM_HOST_SUFFIX);
  } catch {
    return false;
  }
}

export function isAndroidIntentUrl(rawUrl: string): boolean {
  const normalizedUrl = normalizeExternalNavigationUrl(rawUrl).toLowerCase();
  return normalizedUrl.startsWith('intent://') || normalizedUrl.startsWith('instagram://');
}

export function shouldOpenNativeExternalUrl(rawUrl: string): boolean {
  return isInstagramWebUrl(rawUrl) || isAndroidIntentUrl(rawUrl);
}

export function extractAndroidIntentBrowserFallbackUrl(rawUrl: string): string {
  const match = /(?:^|[;#])S\.browser_fallback_url=([^;]+)/i.exec(rawUrl.trim());
  if (!match?.[1]) return '';

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return '';
  }
}

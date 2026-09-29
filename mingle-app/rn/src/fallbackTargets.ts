export function normalizeHttpBaseUrl(rawValue: string): string {
  const trimmed = rawValue.trim();
  if (!trimmed) return '';

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return '';
  }
}

export function normalizeWsUrl(rawValue: string): string {
  const trimmed = rawValue.trim();
  if (!trimmed) return '';

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') return '';
    const pathname = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, '');
    return `${parsed.protocol}//${parsed.host}${pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return '';
  }
}

export function normalizeComparableUrl(rawValue: string): string {
  try {
    const parsed = new URL(rawValue.trim());
    const pathname = parsed.pathname.replace(/\/+$/, '');
    return `${parsed.protocol}//${parsed.host}${pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return rawValue.trim().replace(/\/+$/, '');
  }
}

export function resolveDistinctFallbackTarget(primaryUrl: string, fallbackUrl: string): string {
  const normalizedPrimary = normalizeComparableUrl(primaryUrl);
  const normalizedFallback = normalizeComparableUrl(fallbackUrl);
  if (!normalizedPrimary || !normalizedFallback) return '';
  return normalizedPrimary === normalizedFallback ? '' : fallbackUrl.trim();
}

export function shouldFallbackHttpStatus(status: number): boolean {
  return Number.isFinite(status) && status >= 500 && status <= 599;
}

// Broader than shouldFallbackHttpStatus on purpose: this only decides
// whether the WebView's response should be covered by our own error overlay
// instead of rendered as-is (a stray 404 from a captive portal/DNS hiccup is
// just as much "not our page" as a 5xx is). shouldFallbackHttpStatus stays
// 5xx-only because IT decides whether to switch hosting domains, where a 404
// on the primary host doesn't mean the host itself is broken.
export function isWebViewPageLoadFailureHttpStatus(status: number): boolean {
  return Number.isFinite(status) && status >= 400 && status <= 599;
}

// Decides whether a failed version-policy request (the check the app makes
// on launch to see if it needs to force/recommend an update) should be
// retried against the fallback host. No fallback host configured means there
// is nothing to retry against. A numeric HTTP status means the primary host
// responded, so the same 5xx-only rule as the WebView host switch applies —
// a 4xx (bad request/route) retrying against a different host wouldn't fix
// anything. No status at all means the request never got a response (network
// error, timeout, DNS failure, etc.), which is exactly the case where trying
// a different host might succeed.
export function shouldTryFallbackVersionPolicy(hasFallbackUrl: boolean, errorStatus?: number): boolean {
  if (!hasFallbackUrl) return false;
  if (typeof errorStatus === 'number') return shouldFallbackHttpStatus(errorStatus);
  return true;
}

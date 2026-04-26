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

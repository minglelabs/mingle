const WEB_SUPPORTED_LOCALE_SEGMENTS = new Set([
  'ko',
  'en',
  'ja',
  'zh-cn',
  'zh-tw',
  'fr',
  'de',
  'es',
  'pt',
  'it',
  'ru',
  'ar',
  'hi',
  'th',
  'vi',
]);

function splitPathname(pathname: string): string[] {
  return pathname
    .split('/')
    .map(segment => segment.trim())
    .filter(Boolean);
}

export function parseWebPathname(rawUrl: string): string {
  const candidate = rawUrl.trim();
  if (!candidate) return '';

  try {
    return new URL(candidate).pathname || '';
  } catch {
    if (candidate.startsWith('/')) return candidate;
    return '';
  }
}

export function isLiveDemoPathname(pathname: string): boolean {
  if (!pathname.trim()) return false;
  const segments = splitPathname(pathname);
  if (segments.length === 0) return false;

  const locale = segments[0]?.toLowerCase() || '';
  if (!WEB_SUPPORTED_LOCALE_SEGMENTS.has(locale)) return false;
  if (segments.length === 1) return true;

  return segments.length === 2 && segments[1] === 'translator';
}

export function shouldDisableIosWebViewScrolling(params: {
  isIosPlatform: boolean;
  pathname: string;
}): boolean {
  return params.isIosPlatform && isLiveDemoPathname(params.pathname);
}

export function shouldHideIosKeyboardAccessoryView(params: {
  isIosPlatform: boolean;
  pathname: string;
}): boolean {
  return params.isIosPlatform && isLiveDemoPathname(params.pathname);
}

export function resolveNativeBannerContentHeightPx(params: {
  bannerHeightPx: number;
  canvasScale: number;
}): number {
  const safeScale = params.canvasScale > 0 ? params.canvasScale : 1;
  return Math.max(0, Math.round(params.bannerHeightPx / safeScale));
}

export function normalizeNativeBottomBarClearancePx(value: unknown): number {
  const numeric = Number(value ?? '');
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.round(numeric);
}

export function resolveNativeBottomBannerContentInsetPx(params: {
  position: 'top' | 'bottom';
  bannerHeightPx: number;
  canvasScale: number;
  bottomBannerClearancePx: number;
}): number {
  if (params.position !== 'bottom') return 0;

  const clearancePx = normalizeNativeBottomBarClearancePx(params.bottomBannerClearancePx);
  const bannerContentHeightPx = resolveNativeBannerContentHeightPx({
    bannerHeightPx: params.bannerHeightPx,
    canvasScale: params.canvasScale,
  });

  return clearancePx + bannerContentHeightPx;
}

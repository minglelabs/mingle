import { WEB_SUPPORTED_LOCALE_SEGMENTS } from './i18n';

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

  return (
    segments.length === 2
    && (segments[1] === 'translator' || segments[1] === 'conversations')
  );
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

export function shouldEnableIosWebViewBackForwardNavigation(params: {
  isIosPlatform: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
}): boolean {
  return params.isIosPlatform && (params.canGoBack || params.canGoForward);
}

export function shouldEnableNativeWebViewDebugging(params: {
  isDebugBuild: boolean;
}): boolean {
  return params.isDebugBuild;
}

type NativeRuntimeWebViewBannerPosition = 'top' | 'bottom';

function normalizePositiveInteger(value: unknown): number {
  const numeric = Number(value ?? '');
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.round(numeric);
}

function appendQueryParams(raw: string, params: URLSearchParams): string {
  try {
    const url = new URL(raw);
    params.forEach((value, key) => {
      url.searchParams.set(key, value);
    });
    return url.toString();
  } catch {
    const query = params.toString();
    if (!query) return raw;
    const separator = raw.includes('?') ? '&' : '?';
    return `${raw}${separator}${query}`;
  }
}

export function appendNativeRuntimeWebViewParams(
  raw: string,
  params: {
    nativeBannerPosition?: NativeRuntimeWebViewBannerPosition | null;
    nativeBannerInsetPx?: number;
    clientVersion?: string;
    clientBuild?: string;
  },
): string {
  const query = new URLSearchParams();
  const nativeBannerPosition =
    params.nativeBannerPosition === 'top' || params.nativeBannerPosition === 'bottom'
      ? params.nativeBannerPosition
      : null;
  const nativeBannerInsetPx = normalizePositiveInteger(params.nativeBannerInsetPx);
  const clientVersion = params.clientVersion?.trim() || '';
  const clientBuild = params.clientBuild?.trim() || '';

  if (nativeBannerPosition) {
    query.set('nativeBannerPosition', nativeBannerPosition);
    if (nativeBannerInsetPx > 0) {
      query.set(
        nativeBannerPosition === 'top' ? 'nativeTopInsetPx' : 'nativeBottomInsetPx',
        String(nativeBannerInsetPx),
      );
    }
  }

  if (clientVersion) {
    query.set('nativeClientVersion', clientVersion);
  }
  if (clientBuild) {
    query.set('nativeClientBuild', clientBuild);
  }

  return appendQueryParams(raw, query);
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

  const bannerContentHeightPx = resolveNativeBannerContentHeightPx({
    bannerHeightPx: params.bannerHeightPx,
    canvasScale: params.canvasScale,
  });

  const clearancePx = normalizeNativeBottomBarClearancePx(params.bottomBannerClearancePx);
  if (clearancePx > 0) {
    // The bottom bar already reserves the clearance space inside the WebView.
    // Only report the banner's own overlay height back to web content.
    return bannerContentHeightPx;
  }

  return bannerContentHeightPx;
}

export function resolveNativeBottomBannerWebInsetPx(params: {
  isIosPlatform: boolean;
  bannerContentInsetPx: number;
  safeAreaInsetBottomPx: number;
}): number {
  const bannerContentInsetPx = normalizeNativeBottomBarClearancePx(params.bannerContentInsetPx);
  const safeAreaInsetBottomPx = normalizeNativeBottomBarClearancePx(params.safeAreaInsetBottomPx);

  return params.isIosPlatform
    ? bannerContentInsetPx
    : bannerContentInsetPx + safeAreaInsetBottomPx;
}

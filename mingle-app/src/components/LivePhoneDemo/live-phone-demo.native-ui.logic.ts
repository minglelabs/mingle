export const NATIVE_UI_EVENT = 'mingle:native-ui'
export const NATIVE_UI_QUERY_KEY = 'nativeUi'
export const NATIVE_UI_LAST_BANNER_LAYOUT_WINDOW_KEY = '__MINGLE_LAST_NATIVE_BANNER_LAYOUT'

export interface NativeUiScrollToTopEventDetail {
  type: 'scroll_to_top'
  source: string
}

export interface NativeUiBannerLayoutEventDetail {
  type: 'banner_layout'
  position: 'top' | 'bottom'
  topInsetPx: number
  bottomInsetPx: number
}

export function parseNativeUiScrollToTopDetail(
  detail: unknown,
): NativeUiScrollToTopEventDetail | null {
  if (!detail || typeof detail !== 'object') return null

  const payload = detail as Record<string, unknown>
  if (payload.type !== 'scroll_to_top') return null

  const sourceRaw = payload.source
  const source = typeof sourceRaw === 'string' && sourceRaw.trim()
    ? sourceRaw.trim()
    : 'unknown'

  return {
    type: 'scroll_to_top',
    source,
  }
}

export function parseNativeUiBannerLayoutDetail(
  detail: unknown,
): NativeUiBannerLayoutEventDetail | null {
  if (!detail || typeof detail !== 'object') return null

  const payload = detail as Record<string, unknown>
  if (payload.type !== 'banner_layout') return null

  const position = payload.position === 'top' || payload.position === 'bottom'
    ? payload.position
    : null
  if (!position) return null

  const topInsetPx = Number(payload.topInsetPx)
  const bottomInsetPx = Number(payload.bottomInsetPx)

  return {
    type: 'banner_layout',
    position,
    topInsetPx: Number.isFinite(topInsetPx) && topInsetPx > 0 ? Math.round(topInsetPx) : 0,
    bottomInsetPx: Number.isFinite(bottomInsetPx) && bottomInsetPx > 0 ? Math.round(bottomInsetPx) : 0,
  }
}

export function readCachedNativeUiBannerLayout(
  value: unknown,
): NativeUiBannerLayoutEventDetail | null {
  if (!value || typeof value !== 'object') return null
  const candidate = (value as Record<string, unknown>)[NATIVE_UI_LAST_BANNER_LAYOUT_WINDOW_KEY]
  return parseNativeUiBannerLayoutDetail(candidate)
}

export function isNativeUiBridgeEnabledFromSearch(search: string): boolean {
  try {
    const params = new URLSearchParams(search || '')
    const value = (params.get(NATIVE_UI_QUERY_KEY) || '').trim().toLowerCase()
    return value === '1' || value === 'true'
  } catch {
    return false
  }
}

function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase()
  return normalized === '127.0.0.1' || normalized === 'localhost' || normalized === '::1'
}

function isLoopbackUrl(rawUrl: string): boolean {
  if (!rawUrl) return false

  try {
    return isLoopbackHost(new URL(rawUrl).hostname)
  } catch {
    return /(127\.0\.0\.1|localhost|::1)/i.test(rawUrl)
  }
}

function isDebugWebViewRemountAllowedUrl(rawUrl: string): boolean {
  if (!rawUrl) return false

  try {
    return new URL(rawUrl).hostname.toLowerCase() === 'mingle-app-devbox.photo-for-passport.com'
  } catch {
    return /mingle-app-devbox\.photo-for-passport\.com/i.test(rawUrl)
  }
}

export interface NativeDebugWebViewRemountVisibilityInput {
  rawUrl: string
  isDevelopmentMode: boolean
}

export function shouldEnableNativeDebugWebViewRemount(
  input: NativeDebugWebViewRemountVisibilityInput,
): boolean {
  return input.isDevelopmentMode
    || isLoopbackUrl(input.rawUrl)
    || isDebugWebViewRemountAllowedUrl(input.rawUrl)
}

export interface IosTopTapFallbackInput {
  isLikelyIosPlatform: boolean
  isNativeApp: boolean
  isNativeUiBridgeEnabled: boolean
}

export function shouldEnableIosTopTapFallback(input: IosTopTapFallbackInput): boolean {
  // Keep legacy iOS margin-tap behavior as the default.
  if (input.isLikelyIosPlatform) return true
  // If iOS UA detection ever fails inside native WebView, still keep fallback on
  // when native bridge mode is explicitly enabled.
  return input.isNativeApp && input.isNativeUiBridgeEnabled
}

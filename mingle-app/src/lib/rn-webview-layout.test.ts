import { describe, expect, it } from 'vitest'

import {
  isLiveDemoPathname,
  parseWebPathname,
  resolveNativeBannerContentHeightPx,
  resolveNativeBottomBannerContentInsetPx,
  shouldDisableIosWebViewScrolling,
} from '../../rn/src/webViewLayout'

describe('RN WebView layout helpers', () => {
  it('parses pathname from a full URL', () => {
    expect(parseWebPathname('https://mingle-app-devbox.photo-for-passport.com/ko?nativeUi=1')).toBe('/ko')
  })

  it('returns empty pathname for invalid URLs', () => {
    expect(parseWebPathname('not a valid url')).toBe('')
    expect(parseWebPathname('')).toBe('')
  })

  it('identifies live demo routes only for locale home and translator pages', () => {
    expect(isLiveDemoPathname('/ko')).toBe(true)
    expect(isLiveDemoPathname('/en/translator')).toBe(true)
    expect(isLiveDemoPathname('/ko/account')).toBe(false)
    expect(isLiveDemoPathname('/ko/auth/native')).toBe(false)
    expect(isLiveDemoPathname('')).toBe(false)
  })

  it('disables iOS WebView scrolling only on live demo routes', () => {
    expect(shouldDisableIosWebViewScrolling({
      isIosPlatform: true,
      pathname: '/ko',
    })).toBe(true)

    expect(shouldDisableIosWebViewScrolling({
      isIosPlatform: true,
      pathname: '/ko/account',
    })).toBe(false)

    expect(shouldDisableIosWebViewScrolling({
      isIosPlatform: false,
      pathname: '/ko',
    })).toBe(false)
  })

  it('derives native banner content height from banner height and scale', () => {
    expect(resolveNativeBannerContentHeightPx({
      bannerHeightPx: 50,
      canvasScale: 1,
    })).toBe(50)

    expect(resolveNativeBannerContentHeightPx({
      bannerHeightPx: 50,
      canvasScale: 0.5,
    })).toBe(100)
  })

  it('includes both clearance and banner height in bottom banner inset', () => {
    expect(resolveNativeBottomBannerContentInsetPx({
      position: 'bottom',
      bannerHeightPx: 50,
      canvasScale: 1,
      bottomBannerClearancePx: 94,
    })).toBe(144)
  })

  it('returns zero bottom banner inset when the banner is not on the bottom', () => {
    expect(resolveNativeBottomBannerContentInsetPx({
      position: 'top',
      bannerHeightPx: 50,
      canvasScale: 1,
      bottomBannerClearancePx: 94,
    })).toBe(0)
  })
})

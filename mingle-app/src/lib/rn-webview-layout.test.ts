import { describe, expect, it } from 'vitest'

import {
  isLiveDemoPathname,
  parseWebPathname,
  resolveNativeBannerContentHeightPx,
  resolveNativeBottomBannerContentInsetPx,
  shouldEnableIosWebViewBackForwardNavigation,
  shouldEnableNativeWebViewDebugging,
  resolveNativeBottomBannerWebInsetPx,
  shouldDisableIosWebViewScrolling,
  shouldHideIosKeyboardAccessoryView,
} from '../../rn/src/webViewLayout'

describe('RN WebView layout helpers', () => {
  it('parses pathname from a full URL', () => {
    expect(parseWebPathname('https://mingle-app-devbox.photo-for-passport.com/ko?nativeUi=1')).toBe('/ko')
  })

  it('returns empty pathname for invalid URLs', () => {
    expect(parseWebPathname('not a valid url')).toBe('')
    expect(parseWebPathname('')).toBe('')
  })

  it('identifies live demo routes for locale home, translator, and conversations pages', () => {
    expect(isLiveDemoPathname('/ko')).toBe(true)
    expect(isLiveDemoPathname('/en/translator')).toBe(true)
    expect(isLiveDemoPathname('/ja/conversations')).toBe(true)
    expect(isLiveDemoPathname('/pl')).toBe(true)
    expect(isLiveDemoPathname('/he/translator')).toBe(true)
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
      pathname: '/ko/conversations',
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

  it('hides the iOS keyboard accessory view only on live demo routes', () => {
    expect(shouldHideIosKeyboardAccessoryView({
      isIosPlatform: true,
      pathname: '/ko/translator',
    })).toBe(true)

    expect(shouldHideIosKeyboardAccessoryView({
      isIosPlatform: true,
      pathname: '/ko/conversations',
    })).toBe(true)

    expect(shouldHideIosKeyboardAccessoryView({
      isIosPlatform: true,
      pathname: '/ko/account',
    })).toBe(false)

    expect(shouldHideIosKeyboardAccessoryView({
      isIosPlatform: false,
      pathname: '/ko/translator',
    })).toBe(false)
  })

  it('keeps iOS back-forward gestures enabled even when unrelated overlays change', () => {
    expect(shouldEnableIosWebViewBackForwardNavigation({
      isIosPlatform: true,
    })).toBe(true)

    expect(shouldEnableIosWebViewBackForwardNavigation({
      isIosPlatform: false,
    })).toBe(false)
  })

  it('enables native WebView debugging only in debug builds', () => {
    expect(shouldEnableNativeWebViewDebugging({
      isDebugBuild: true,
    })).toBe(true)

    expect(shouldEnableNativeWebViewDebugging({
      isDebugBuild: false,
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

  it('reports only the banner height for the bottom banner inset', () => {
    expect(resolveNativeBottomBannerContentInsetPx({
      position: 'bottom',
      bannerHeightPx: 50,
      canvasScale: 1,
      bottomBannerClearancePx: 94,
    })).toBe(50)
  })

  it('returns zero bottom banner inset when the banner is not on the bottom', () => {
    expect(resolveNativeBottomBannerContentInsetPx({
      position: 'top',
      bannerHeightPx: 50,
      canvasScale: 1,
      bottomBannerClearancePx: 94,
    })).toBe(0)
  })

  it('keeps iOS web bottom inset equal to the banner content height', () => {
    expect(resolveNativeBottomBannerWebInsetPx({
      isIosPlatform: true,
      bannerContentInsetPx: 50,
      safeAreaInsetBottomPx: 34,
    })).toBe(50)
  })

  it('adds Android native safe-area to the reported web bottom inset', () => {
    expect(resolveNativeBottomBannerWebInsetPx({
      isIosPlatform: false,
      bannerContentInsetPx: 50,
      safeAreaInsetBottomPx: 16,
    })).toBe(66)
  })
})

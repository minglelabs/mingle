import {
  appendNativeRuntimeWebViewParams,
  isLiveDemoPathname,
  isNativeTabRootUrl,
  shouldEnableIosWebViewBackForwardNavigation,
} from '../src/webViewLayout';

describe('appendNativeRuntimeWebViewParams', () => {
  it('adds zone-specific banner fallbacks and client build query params', () => {
    expect(
      appendNativeRuntimeWebViewParams('https://example.com/ko?nativeUi=1', {
        nativeListTopInsetPx: 56,
        nativeConversationBannerPosition: 'bottom',
        nativeConversationBannerInsetPx: 56,
        clientVersion: '1.1.1',
        clientBuild: '53',
      }),
    ).toBe(
      'https://example.com/ko?nativeUi=1&nativeListTopInsetPx=56&nativeConversationBannerPosition=bottom&nativeConversationBottomInsetPx=56&nativeClientVersion=1.1.1&nativeClientBuild=53',
    );
  });

  it('adds conversation top banner fallback when the native default is top', () => {
    expect(
      appendNativeRuntimeWebViewParams('https://example.com/ko', {
        nativeListTopInsetPx: 50,
        nativeConversationBannerPosition: 'top',
        nativeConversationBannerInsetPx: 50,
      }),
    ).toBe('https://example.com/ko?nativeListTopInsetPx=50&nativeConversationBannerPosition=top&nativeConversationTopInsetPx=50');
  });
});

describe('shouldEnableIosWebViewBackForwardNavigation', () => {
  const BASE = 'https://mingle-1-1-4-production.up.railway.app';

  it('returns false on Android', () => {
    expect(shouldEnableIosWebViewBackForwardNavigation({
      isIosPlatform: false,
      canGoBack: true,
      canGoForward: false,
      currentUrl: `${BASE}/ko/conversations?conversation=abc`,
    })).toBe(false);
  });

  it('returns true for iOS conversation room URLs even without a history stack', () => {
    expect(shouldEnableIosWebViewBackForwardNavigation({
      isIosPlatform: true,
      canGoBack: false,
      canGoForward: false,
      currentUrl: `${BASE}/ko/conversations?conversation=abc123`,
    })).toBe(true);
  });

  it('returns false for iOS conversation list URLs without a history stack', () => {
    expect(shouldEnableIosWebViewBackForwardNavigation({
      isIosPlatform: true,
      canGoBack: false,
      canGoForward: false,
      currentUrl: `${BASE}/ko/conversations`,
    })).toBe(false);
  });

  it('returns false for an explicit tab root even when older history exists', () => {
    expect(isNativeTabRootUrl(`${BASE}/ko/mypage?nativeTabRoot=1`)).toBe(true);
    expect(shouldEnableIosWebViewBackForwardNavigation({
      isIosPlatform: true,
      canGoBack: true,
      canGoForward: true,
      currentUrl: `${BASE}/ko/mypage?nativeTabRoot=1`,
    })).toBe(false);
  });

  it('returns true for iOS conversation list URLs when back history exists', () => {
    expect(shouldEnableIosWebViewBackForwardNavigation({
      isIosPlatform: true,
      canGoBack: true,
      canGoForward: false,
      currentUrl: `${BASE}/ko/conversations`,
    })).toBe(true);
  });

  it('returns false for My Page surfaces so web panel swipes own the gesture', () => {
    expect(shouldEnableIosWebViewBackForwardNavigation({
      isIosPlatform: true,
      canGoBack: true,
      canGoForward: false,
      currentUrl: `${BASE}/ko/mypage/share?nativeUi=1`,
    })).toBe(false);
    expect(shouldEnableIosWebViewBackForwardNavigation({
      isIosPlatform: true,
      canGoBack: true,
      canGoForward: true,
      currentUrl: `${BASE}/ko/mypage?nativeUi=1`,
    })).toBe(false);
  });

  it('returns false on iOS without currentUrl or back history', () => {
    expect(shouldEnableIosWebViewBackForwardNavigation({
      isIosPlatform: true,
      canGoBack: false,
      canGoForward: false,
    })).toBe(false);
  });
});

describe('isLiveDemoPathname', () => {
  it('treats the follower/following list as an in-app My Page surface', () => {
    expect(isLiveDemoPathname('/ko/mypage/follows')).toBe(true);
  });
});

import { appendNativeRuntimeWebViewParams } from '../src/webViewLayout';

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

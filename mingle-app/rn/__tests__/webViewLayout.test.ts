import { appendNativeRuntimeWebViewParams } from '../src/webViewLayout';

describe('appendNativeRuntimeWebViewParams', () => {
  it('adds bottom banner fallback and client build query params', () => {
    expect(
      appendNativeRuntimeWebViewParams('https://example.com/ko?nativeUi=1', {
        nativeBannerPosition: 'bottom',
        nativeBannerInsetPx: 56,
        clientVersion: '1.1.1',
        clientBuild: '53',
      }),
    ).toBe(
      'https://example.com/ko?nativeUi=1&nativeBannerPosition=bottom&nativeBottomInsetPx=56&nativeClientVersion=1.1.1&nativeClientBuild=53',
    );
  });

  it('adds top banner fallback when the native default is top', () => {
    expect(
      appendNativeRuntimeWebViewParams('https://example.com/ko', {
        nativeBannerPosition: 'top',
        nativeBannerInsetPx: 50,
      }),
    ).toBe('https://example.com/ko?nativeBannerPosition=top&nativeTopInsetPx=50');
  });
});

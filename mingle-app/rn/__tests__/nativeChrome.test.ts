import { shouldHideNativeBannerForUrl } from '../src/nativeChrome';

describe('shouldHideNativeBannerForUrl', () => {
  it('hides the native banner on auth-like routes', () => {
    expect(shouldHideNativeBannerForUrl('https://mingle.local/')).toBe(true);
    expect(shouldHideNativeBannerForUrl('https://mingle.local/ko')).toBe(true);
    expect(shouldHideNativeBannerForUrl('https://mingle.local/ko/translator')).toBe(true);
    expect(shouldHideNativeBannerForUrl('https://mingle.local/ko/auth/native')).toBe(true);
    expect(shouldHideNativeBannerForUrl('https://mingle.local/auth/signin')).toBe(true);
  });

  it('keeps the native banner on in-app conversation routes', () => {
    expect(shouldHideNativeBannerForUrl('https://mingle.local/ko/conversations')).toBe(false);
    expect(shouldHideNativeBannerForUrl('https://mingle.local/ko/account')).toBe(false);
  });
});

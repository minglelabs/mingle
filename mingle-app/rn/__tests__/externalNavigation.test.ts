import {
  extractAndroidIntentBrowserFallbackUrl,
  isAndroidIntentUrl,
  isInstagramWebUrl,
  shouldOpenNativeExternalUrl,
} from '../src/externalNavigation';

describe('external navigation', () => {
  it('recognizes Instagram web pages, including logged-out login routes', () => {
    expect(isInstagramWebUrl('https://www.instagram.com/mingle.labs/')).toBe(true);
    expect(isInstagramWebUrl('https://www.instagram.com/accounts/login/')).toBe(true);
    expect(isInstagramWebUrl('https://help.instagram.com/')).toBe(true);
    expect(isInstagramWebUrl('https://example.com/instagram')).toBe(false);
  });

  it('recognizes Android intent URLs emitted by Instagram web', () => {
    expect(isAndroidIntentUrl('intent://mingle.labs#Intent;package=com.instagram.android;end')).toBe(true);
    expect(isAndroidIntentUrl('instagram://user?username=mingle.labs')).toBe(true);
    expect(isAndroidIntentUrl('https://www.instagram.com/mingle.labs/')).toBe(false);
  });

  it('opens Instagram web and intent URLs through native linking', () => {
    expect(shouldOpenNativeExternalUrl('https://www.instagram.com/mingle.labs/')).toBe(true);
    expect(shouldOpenNativeExternalUrl('intent://mingle.labs#Intent;end')).toBe(true);
    expect(shouldOpenNativeExternalUrl('https://mingle-2-0-0-production.up.railway.app/')).toBe(false);
  });

  it('decodes an Android intent browser fallback URL', () => {
    expect(extractAndroidIntentBrowserFallbackUrl(
      'intent://mingle.labs#Intent;package=com.instagram.android;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.instagram;end',
    )).toBe('https://play.google.com/store/apps/details?id=com.instagram');
    expect(extractAndroidIntentBrowserFallbackUrl('intent://mingle.labs#Intent;package=com.instagram.android;end')).toBe('');
  });
});

import { parseNativeProfileLink } from './profileLink';

// RN's built-in URL polyfill (react-native/Libraries/Blob/URL.js) only
// implements hostname/pathname for http(s) schemes — for `mingle://...`
// those getters always come back empty/default. This test runs under
// Jest's real (Node) URL, so it doesn't reproduce that bug directly, but it
// pins the parsed result so a regression back to relying on those getters
// would still change behavior here once run against the RN polyfill.
describe('parseNativeProfileLink', () => {
  const httpsOrigin = 'https://mingle-2-0-0-production.up.railway.app';

  it('parses a mingle:// scheme link', () => {
    expect(parseNativeProfileLink('mingle://profile/user-123', httpsOrigin)).toEqual({
      userId: 'user-123',
      source: 'mingle',
    });
  });

  it('parses a mingle:// scheme link with a query string', () => {
    expect(parseNativeProfileLink('mingle://profile/user-123?linkNonce=abc', httpsOrigin)).toEqual({
      userId: 'user-123',
      source: 'mingle',
    });
  });

  it('parses a mingleprofile:// fallback scheme link', () => {
    expect(parseNativeProfileLink('mingleprofile://profile/user-123', httpsOrigin)).toEqual({
      userId: 'user-123',
      source: 'mingle',
    });
  });

  it('rejects a mingle:// link with the wrong host', () => {
    expect(parseNativeProfileLink('mingle://not-profile/user-123', httpsOrigin)).toBeNull();
  });

  it('parses a matching https link', () => {
    expect(parseNativeProfileLink(`${httpsOrigin}/p/user-123`, httpsOrigin)).toEqual({
      userId: 'user-123',
      source: 'https',
    });
  });

  it('rejects an https link with a different origin', () => {
    expect(parseNativeProfileLink('https://mingle-1-1-4-production.up.railway.app/p/user-123', httpsOrigin)).toBeNull();
  });
});

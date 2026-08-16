import { buildNativeProfileWebUrl, parseNativeProfileLink } from '../src/profileLink';

describe('native profile links', () => {
  const origin = 'https://mingle-2-0-0-production.up.railway.app';

  it('accepts a Mingle HTTPS profile link', () => {
    expect(parseNativeProfileLink(`${origin}/p/cmg123abc`, origin)).toEqual({
      source: 'https',
      userId: 'cmg123abc',
    });
  });

  it('accepts the custom-scheme fallback link', () => {
    expect(parseNativeProfileLink('mingle://profile/cmg123abc', origin)).toEqual({
      source: 'mingle',
      userId: 'cmg123abc',
    });
  });

  it('rejects non-Mingle hosts and malformed profile references', () => {
    expect(parseNativeProfileLink('https://example.com/p/cmg123abc', origin)).toBeNull();
    expect(parseNativeProfileLink(`${origin}/users/cmg123abc`, origin)).toBeNull();
    expect(parseNativeProfileLink(`${origin}/p/not valid`, origin)).toBeNull();
  });

  it('builds a localized native profile route with the active API namespace', () => {
    const result = buildNativeProfileWebUrl({
      baseUrl: `${origin}/?stale=1#old-route`,
      locale: 'ko',
      userId: 'cmg123abc',
      apiNamespace: 'ios/v2.0.0',
      nativeStt: false,
    });

    expect(result).not.toBeNull();
    const url = new URL(result || '');
    expect(url.pathname).toBe('/ko/users/cmg123abc');
    expect(url.searchParams.get('nativeUi')).toBe('1');
    expect(url.searchParams.get('nativeAuth')).toBe('1');
    expect(url.searchParams.get('apiNamespace')).toBe('ios/v2.0.0');
    expect(url.searchParams.get('nativeStt')).toBe('0');
    expect(url.hash).toBe('');
  });

  it('does not build a route for an invalid profile target', () => {
    expect(buildNativeProfileWebUrl({
      baseUrl: origin,
      locale: 'ko',
      userId: 'not valid',
    })).toBeNull();
  });
});

import { parseNativeProfileLink } from '../src/profileLink';

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
});

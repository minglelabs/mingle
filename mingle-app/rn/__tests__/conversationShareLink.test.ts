import {
  buildNativeConversationShareWebUrl,
  parseNativeConversationShareLink,
} from '../src/conversationShareLink';

describe('native conversation share links', () => {
  const origin = 'https://mingle-2-0-0-production.up.railway.app';
  const token = 'cmg123abc';

  it('accepts a Mingle HTTPS share link', () => {
    expect(parseNativeConversationShareLink(`${origin}/s/${token}`, origin)).toEqual({
      source: 'https',
      shareToken: token,
    });
  });

  it('accepts the custom-scheme fallback link', () => {
    expect(parseNativeConversationShareLink(`mingle://conversation-spectate/${token}?linkNonce=launch-1`, origin)).toEqual({
      source: 'mingle',
      shareToken: token,
    });
    expect(parseNativeConversationShareLink(`mingleconversation://conversation-spectate/${token}?linkNonce=launch-2`, origin)).toEqual({
      source: 'mingle',
      shareToken: token,
    });
  });

  it('rejects non-Mingle hosts and malformed share references', () => {
    expect(parseNativeConversationShareLink(`https://example.com/s/${token}`, origin)).toBeNull();
    expect(parseNativeConversationShareLink(`${origin}/conversations/${token}`, origin)).toBeNull();
    expect(parseNativeConversationShareLink(`${origin}/s/not valid`, origin)).toBeNull();
  });

  it('builds the spectate web route with the native-ui flag', () => {
    const result = buildNativeConversationShareWebUrl({
      baseUrl: `${origin}/?stale=1#old-route`,
      shareToken: token,
    });

    expect(result).not.toBeNull();
    const url = new URL(result || '');
    expect(url.pathname).toBe(`/s/${token}`);
    expect(url.searchParams.get('nativeUi')).toBe('1');
    expect(url.hash).toBe('');
  });

  it('does not build a route for an invalid share token', () => {
    expect(buildNativeConversationShareWebUrl({
      baseUrl: origin,
      shareToken: 'not valid',
    })).toBeNull();
  });
});

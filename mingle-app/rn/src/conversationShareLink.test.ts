import { parseNativeConversationShareLink } from './conversationShareLink';

// Mirrors profileLink.test.ts — see the note there about RN's built-in URL
// polyfill not implementing hostname/pathname for non-http(s) schemes.
describe('parseNativeConversationShareLink', () => {
  const httpsOrigin = 'https://mingle-2-0-0-production.up.railway.app';

  it('parses a mingle:// scheme link', () => {
    expect(parseNativeConversationShareLink('mingle://conversation-spectate/token-123', httpsOrigin)).toEqual({
      shareToken: 'token-123',
      source: 'mingle',
    });
  });

  it('parses a mingleconversation:// fallback scheme link', () => {
    expect(parseNativeConversationShareLink('mingleconversation://conversation-spectate/token-123', httpsOrigin)).toEqual({
      shareToken: 'token-123',
      source: 'mingle',
    });
  });

  it('rejects a mingle:// link with the wrong host', () => {
    expect(parseNativeConversationShareLink('mingle://profile/token-123', httpsOrigin)).toBeNull();
  });

  it('parses a matching https link', () => {
    expect(parseNativeConversationShareLink(`${httpsOrigin}/s/token-123`, httpsOrigin)).toEqual({
      shareToken: 'token-123',
      source: 'https',
    });
  });
});

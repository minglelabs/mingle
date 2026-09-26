import {
  buildConversationRoomPath,
  buildNativePushTapEventScript,
  isSafeRelativeAppPath,
  NATIVE_PUSH_TAP_EVENT,
  NATIVE_PUSH_TAP_WINDOW_KEY,
  resolvePushTapPath,
} from '../src/pushNavigation';

describe('isSafeRelativeAppPath', () => {
  it('accepts same-origin relative paths with query and hash', () => {
    expect(isSafeRelativeAppPath('/ko/feed?postId=p1&commentId=c9')).toBe(true);
    expect(isSafeRelativeAppPath('/en/conversations?conversation=chan_1')).toBe(true);
    expect(isSafeRelativeAppPath('/ja/feed#section')).toBe(true);
    expect(isSafeRelativeAppPath('/')).toBe(true);
  });

  it('rejects absolute URLs and scheme-bearing values', () => {
    expect(isSafeRelativeAppPath('https://evil.example.com/ko/feed')).toBe(false);
    expect(isSafeRelativeAppPath('http://mingle.invalid/ko/feed')).toBe(false);
    expect(isSafeRelativeAppPath('mingle://profile/u1')).toBe(false);
    expect(isSafeRelativeAppPath('javascript:alert(1)')).toBe(false);
    expect(isSafeRelativeAppPath('  javascript:alert(1)')).toBe(false);
  });

  it('rejects protocol-relative and authority-smuggling paths', () => {
    expect(isSafeRelativeAppPath('//evil.example.com/path')).toBe(false);
    expect(isSafeRelativeAppPath('/\\evil.example.com')).toBe(false);
    expect(isSafeRelativeAppPath('/..//evil.example.com')).toBe(false);
  });

  it('rejects path traversal, empty, non-leading-slash, and non-string input', () => {
    expect(isSafeRelativeAppPath('/ko/../../etc/passwd')).toBe(false);
    expect(isSafeRelativeAppPath('ko/feed')).toBe(false);
    expect(isSafeRelativeAppPath('')).toBe(false);
    expect(isSafeRelativeAppPath('/ko/feed\n')).toBe(false);
    expect(isSafeRelativeAppPath(null)).toBe(false);
    expect(isSafeRelativeAppPath(undefined)).toBe(false);
    expect(isSafeRelativeAppPath(42)).toBe(false);
  });
});

describe('buildConversationRoomPath', () => {
  it('builds a locale-prefixed room path from a channel id', () => {
    expect(buildConversationRoomPath('ko', 'chan_123')).toBe(
      '/ko/conversations?conversation=chan_123',
    );
    expect(buildConversationRoomPath('en-US', 'abc-DEF_9')).toBe(
      '/en-US/conversations?conversation=abc-DEF_9',
    );
  });

  it('always yields a path that passes the relative-path guard', () => {
    const path = buildConversationRoomPath('ja', 'cmg987');
    expect(path).not.toBeNull();
    expect(isSafeRelativeAppPath(path)).toBe(true);
  });

  it('rejects malformed locales and conversation ids', () => {
    expect(buildConversationRoomPath('', 'chan_1')).toBeNull();
    expect(buildConversationRoomPath('k/o', 'chan_1')).toBeNull();
    expect(buildConversationRoomPath('ko', '')).toBeNull();
    expect(buildConversationRoomPath('ko', 'has space')).toBeNull();
    expect(buildConversationRoomPath('ko', '../escape')).toBeNull();
  });
});

describe('resolvePushTapPath', () => {
  it('uses an explicit safe url first (comment/reply pushes)', () => {
    expect(
      resolvePushTapPath({ type: 'comment', url: '/ko/feed?postId=p1&commentId=c9' }, 'en'),
    ).toBe('/ko/feed?postId=p1&commentId=c9');
    expect(
      resolvePushTapPath({ type: 'comment_reply', url: '/en/feed?postId=p2&commentId=c1' }, 'ko'),
    ).toBe('/en/feed?postId=p2&commentId=c1');
  });

  it('ignores an unsafe url instead of navigating to it', () => {
    expect(
      resolvePushTapPath({ type: 'comment', url: 'https://evil.example.com/steal' }, 'en'),
    ).toBeNull();
    expect(resolvePushTapPath({ type: 'comment', url: '//evil.example.com' }, 'en')).toBeNull();
  });

  it('falls back to the conversation room for message pushes without a url', () => {
    expect(
      resolvePushTapPath({ type: 'conversation_message', conversationId: 'chan_5' }, 'ko'),
    ).toBe('/ko/conversations?conversation=chan_5');
    // An empty type is treated as a message-style fallback when only a
    // conversationId is present.
    expect(resolvePushTapPath({ conversationId: 'chan_6' }, 'en')).toBe(
      '/en/conversations?conversation=chan_6',
    );
  });

  it('returns null when nothing safe is named', () => {
    expect(resolvePushTapPath({ type: 'follow' }, 'ko')).toBeNull();
    expect(resolvePushTapPath({ type: 'conversation_message' }, 'ko')).toBeNull();
    expect(resolvePushTapPath({}, 'ko')).toBeNull();
    expect(
      resolvePushTapPath({ type: 'conversation_message', conversationId: 'bad id' }, 'ko'),
    ).toBeNull();
  });
});

describe('buildNativePushTapEventScript', () => {
  it('embeds the window key, event name, and path for a safe request', () => {
    const script = buildNativePushTapEventScript({
      path: '/ko/conversations?conversation=chan_1',
      sequence: 3,
    });
    expect(script).toContain(NATIVE_PUSH_TAP_WINDOW_KEY);
    expect(script).toContain(NATIVE_PUSH_TAP_EVENT);
    expect(script).toContain('/ko/conversations?conversation=chan_1');
    expect(script).not.toContain('window.location.assign');
  });

  it('emits a no-op script for an unsafe path', () => {
    const script = buildNativePushTapEventScript({
      path: 'https://evil.example.com',
      sequence: 1,
    });
    expect(script).toBe('true;');
  });
});

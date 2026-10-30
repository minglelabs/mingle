import {
  NATIVE_WEB_RESTORE_TTL_MS,
  buildWebRestoreWebUrl,
  classifyConversationWebUrl,
  readNativeLastScreenSnapshot,
  readNativeWebRestorePayload,
  resolveConversationRestorePayloadFromUrl,
  resolveWebRestorePayloadFromUrl,
} from '../src/webViewRestore';

describe('webViewRestore', () => {
  it('classifies conversation room and list URLs', () => {
    expect(classifyConversationWebUrl('https://mingle.example/en/conversations?conversation=conv_1')).toBe('room');
    expect(classifyConversationWebUrl('https://mingle.example/en/conversations?nativeUi=1')).toBe('list');
    expect(classifyConversationWebUrl('https://mingle.example/en?nativeUi=1')).toBeNull();
  });

  it('extracts a durable restore payload from conversation URLs', () => {
    expect(resolveConversationRestorePayloadFromUrl(
      'https://mingle.example/en/conversations?conversation=conv_1&nativeUi=1',
      1700000000000,
    )).toEqual({
      url: 'https://mingle.example/en/conversations?conversation=conv_1&nativeUi=1',
      conversationId: 'conv_1',
      createdAtMs: 1700000000000,
    });
    expect(resolveConversationRestorePayloadFromUrl('https://mingle.example/en/conversations?nativeUi=1')).toBeNull();
  });

  it('builds a restore source from the current runtime URL and restored conversation id', () => {
    expect(buildWebRestoreWebUrl(
      'https://mingle.example/ko?nativeStt=1&nativeUi=1&apiNamespace=ios%2Fv1.1.3&nativeListTopInsetPx=50',
      'https://mingle.example/en/conversations?conversation=conv_2&nativeUi=1&oldParam=1',
    )).toBe(
      'https://mingle.example/ko/conversations?nativeStt=1&nativeUi=1&apiNamespace=ios%2Fv1.1.3&nativeListTopInsetPx=50&conversation=conv_2',
    );
  });

  it('restores other allow-listed screens with only their own query params', () => {
    const base = 'https://mingle.example/ko?nativeUi=1&apiNamespace=ios%2Fv1.1.3';
    expect(buildWebRestoreWebUrl(base, 'https://mingle.example/ko/mypage?nativeUi=1&nativeTabRoot=1'))
      .toBe('https://mingle.example/ko/mypage?nativeUi=1&apiNamespace=ios%2Fv1.1.3');
    expect(buildWebRestoreWebUrl(base, 'https://mingle.example/ko/mypage/follows?tab=following&nativeUi=1'))
      .toBe('https://mingle.example/ko/mypage/follows?nativeUi=1&apiNamespace=ios%2Fv1.1.3&tab=following');
    expect(buildWebRestoreWebUrl(base, 'https://mingle.example/en/users/user_1?nativeUi=1'))
      .toBe('https://mingle.example/ko/users/user_1?nativeUi=1&apiNamespace=ios%2Fv1.1.3');
    expect(buildWebRestoreWebUrl(base, 'https://mingle.example/ko/feed?postId=p1&commentId=c1&nativeUi=1'))
      .toBe('https://mingle.example/ko/feed?nativeUi=1&apiNamespace=ios%2Fv1.1.3');
    expect(buildWebRestoreWebUrl(base, 'https://mingle.example/ko/posts/viewer?kind=author&authorId=u1&postId=p2'))
      .toBe('https://mingle.example/ko/posts/viewer?nativeUi=1&apiNamespace=ios%2Fv1.1.3&kind=author&authorId=u1&postId=p2');
    expect(buildWebRestoreWebUrl(base, 'https://mingle.example/ko/mypage/posts/drafts'))
      .toBe('https://mingle.example/ko/mypage/posts/drafts?nativeUi=1&apiNamespace=ios%2Fv1.1.3');
    expect(buildWebRestoreWebUrl(base, 'https://mingle.example/ko/conversations?nativeTabRoot=1'))
      .toBe('https://mingle.example/ko/conversations?nativeUi=1&apiNamespace=ios%2Fv1.1.3');
  });

  it('never restores auth, sign-in, creation or unknown screens', () => {
    for (const url of [
      'https://mingle.example/ko',
      'https://mingle.example/ko/auth/signin?callbackUrl=%2Fko',
      'https://mingle.example/ko/auth/native?requestId=1',
      'https://mingle.example/auth/signin',
      'https://mingle.example/ko/conversations/new-group',
      'https://mingle.example/ko/translator',
      'https://mingle.example/ko/compose',
      'https://mingle.example/ko/posts/p1/edit',
      'https://mingle.example/p/user_1',
      'https://mingle.example/s/share_token',
      'https://mingle.example/ko/users',
      'about:blank',
    ]) {
      expect(resolveWebRestorePayloadFromUrl(url)).toBeNull();
      expect(buildWebRestoreWebUrl('https://mingle.example/ko?nativeUi=1', url)).toBe('');
    }
  });

  it('keys rooms by conversation id and other screens by route', () => {
    expect(resolveWebRestorePayloadFromUrl('https://mingle.example/ko/conversations?conversation=c1', 5))
      .toEqual({ url: 'https://mingle.example/ko/conversations?conversation=c1', restoreKey: 'c1', createdAtMs: 5 });
    expect(resolveWebRestorePayloadFromUrl('https://mingle.example/ko/mypage/follows?tab=following&nativeUi=1', 5)?.restoreKey)
      .toBe('route:/mypage/follows?tab=following');
    expect(resolveWebRestorePayloadFromUrl('https://mingle.example/ko/conversations?nativeUi=1', 5)?.restoreKey)
      .toBe('route:/conversations');
  });

  it('reads payloads written by older builds and ignores expired or inconsistent ones', () => {
    const legacyRoom = {
      conversationRestoreUrl: 'https://mingle.example/en/conversations?conversation=conv_1',
      conversationRestoreConversationId: 'conv_1',
      conversationRestoreCreatedAtMs: 1000,
    };
    expect(readNativeWebRestorePayload(legacyRoom, 1000 + NATIVE_WEB_RESTORE_TTL_MS)).toEqual({
      url: 'https://mingle.example/en/conversations?conversation=conv_1',
      restoreKey: 'conv_1',
      createdAtMs: 1000,
    });
    expect(readNativeWebRestorePayload(legacyRoom, 1000 + NATIVE_WEB_RESTORE_TTL_MS + 1)).toBeNull();
    expect(readNativeWebRestorePayload({ ...legacyRoom, conversationRestoreConversationId: 'conv_2' }, 2000)).toBeNull();

    expect(readNativeWebRestorePayload({
      conversationRestoreUrl: 'https://mingle.example/ko/mypage',
      conversationRestoreConversationId: 'route:/mypage',
      conversationRestoreCreatedAtMs: '1000',
    }, 2000)?.restoreKey).toBe('route:/mypage');
    expect(readNativeWebRestorePayload({
      conversationRestoreUrl: 'https://mingle.example/ko/auth/signin',
      conversationRestoreConversationId: 'route:/auth/signin',
      conversationRestoreCreatedAtMs: 1000,
    }, 2000)).toBeNull();
  });

  it('only uses a last-screen capture that matches the current window and appearance', () => {
    const config = {
      lastScreenSnapshotPath: '/var/mobile/app/Library/Application Support/MingleLastScreen/last-screen.jpg',
      lastScreenSnapshotCreatedAtMs: 1000,
      lastScreenSnapshotWidth: 393,
      lastScreenSnapshotHeight: 852,
      lastScreenSnapshotColorScheme: 'light',
    };
    const current = { nowMs: 2000, width: 393, height: 852, colorScheme: 'light' };
    expect(readNativeLastScreenSnapshot(config, current)).toEqual({
      uri: 'file:///var/mobile/app/Library/Application Support/MingleLastScreen/last-screen.jpg',
      createdAtMs: 1000,
    });
    expect(readNativeLastScreenSnapshot(config, { ...current, colorScheme: 'dark' })).toBeNull();
    expect(readNativeLastScreenSnapshot(config, { ...current, width: 852, height: 393 })).toBeNull();
    expect(readNativeLastScreenSnapshot(config, { ...current, nowMs: 1001 + NATIVE_WEB_RESTORE_TTL_MS })).toBeNull();
    expect(readNativeLastScreenSnapshot({ ...config, lastScreenSnapshotPath: '' }, current)).toBeNull();
  });
});

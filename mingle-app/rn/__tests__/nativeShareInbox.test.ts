import {
  buildNativeShareInboxEventScript,
  isNativeShareInboxLink,
  NATIVE_SHARE_INBOX_EVENT,
  NATIVE_SHARE_INBOX_WINDOW_KEY,
  normalizeNativeShareInboxPayload,
  normalizeNativeShareTargetConversationId,
  normalizeNativeShareTargetDonation,
} from '../src/nativeShareInbox';

describe('isNativeShareInboxLink', () => {
  it('accepts the URL the share extension opens', () => {
    expect(isNativeShareInboxLink('mingle://share-inbox')).toBe(true);
    expect(isNativeShareInboxLink('mingle://share-inbox/')).toBe(true);
    expect(isNativeShareInboxLink('mingle://share-inbox?x=1')).toBe(true);
  });

  it('rejects other links', () => {
    expect(isNativeShareInboxLink('mingle://profile/user-1')).toBe(false);
    expect(isNativeShareInboxLink('mingle://share-inbox-other')).toBe(false);
    expect(isNativeShareInboxLink('https://example.com/share-inbox')).toBe(false);
    expect(isNativeShareInboxLink(null)).toBe(false);
  });
});

describe('normalizeNativeShareInboxPayload', () => {
  it('keeps an image share aimed at a conversation', () => {
    expect(normalizeNativeShareInboxPayload({
      id: 'abc-123',
      conversationId: 'conv_1',
      imageBase64: 'QUJD',
      imageMimeType: 'image/jpeg',
    })).toEqual({
      id: 'abc-123',
      conversationId: 'conv_1',
      text: null,
      image: { mimeType: 'image/jpeg', base64: 'QUJD' },
    });
  });

  it('keeps a text share with no conversation picked', () => {
    expect(normalizeNativeShareInboxPayload({ id: 'abc', text: '  https://example.com  ' })).toEqual({
      id: 'abc',
      conversationId: null,
      text: 'https://example.com',
      image: null,
    });
  });

  it('drops a malformed conversation id but keeps the share', () => {
    expect(normalizeNativeShareInboxPayload({ id: 'abc', conversationId: '../x', text: 'hi' })?.conversationId)
      .toBeNull();
  });

  it('rejects an empty share, a bad id, and non-base64 image data', () => {
    expect(normalizeNativeShareInboxPayload({ id: 'abc' })).toBeNull();
    expect(normalizeNativeShareInboxPayload({ id: 'a b', text: 'hi' })).toBeNull();
    expect(normalizeNativeShareInboxPayload({
      id: 'abc',
      imageBase64: '");alert(1);//',
      imageMimeType: 'image/jpeg',
    })).toBeNull();
    expect(normalizeNativeShareInboxPayload(null)).toBeNull();
  });
});

describe('buildNativeShareInboxEventScript', () => {
  it('stores the payload on window and dispatches the event', () => {
    const script = buildNativeShareInboxEventScript({
      id: 'abc',
      conversationId: 'conv_1',
      text: 'he said "hi"</script>',
      image: null,
    });
    const target = { dispatched: [] as Array<{ type: string; detail: unknown }> } as Record<string, any>;
    const windowStub = {
      dispatchEvent: (event: { type: string; detail: unknown }) => target.dispatched.push(event),
    } as Record<string, any>;
    class CustomEventStub {
      type: string;
      detail: unknown;
      constructor(type: string, init: { detail: unknown }) {
        this.type = type;
        this.detail = init.detail;
      }
    }
    // eslint-disable-next-line no-new-func
    new Function('window', 'CustomEvent', script)(windowStub, CustomEventStub);

    expect(windowStub[NATIVE_SHARE_INBOX_WINDOW_KEY].text).toBe('he said "hi"</script>');
    expect(target.dispatched).toHaveLength(1);
    expect(target.dispatched[0].type).toBe(NATIVE_SHARE_INBOX_EVENT);
  });
});

describe('share target donations', () => {
  it('normalizes a donation', () => {
    expect(normalizeNativeShareTargetDonation({
      conversationId: 'conv_1',
      displayName: '  Hana  ',
      avatarUrl: 'https://cdn.example.com/a.jpg',
    })).toEqual({
      conversationId: 'conv_1',
      displayName: 'Hana',
      avatarUrl: 'https://cdn.example.com/a.jpg',
    });
  });

  it('drops a non-http avatar and rejects a nameless or malformed donation', () => {
    expect(normalizeNativeShareTargetDonation({
      conversationId: 'conv_1',
      displayName: 'Hana',
      avatarUrl: 'file:///etc/passwd',
    })?.avatarUrl).toBeNull();
    expect(normalizeNativeShareTargetDonation({ conversationId: 'conv_1', displayName: ' ' })).toBeNull();
    expect(normalizeNativeShareTargetDonation({ conversationId: 'a/b', displayName: 'Hana' })).toBeNull();
  });

  it('reads the conversation id of a removal', () => {
    expect(normalizeNativeShareTargetConversationId({ conversationId: 'conv_1' })).toBe('conv_1');
    expect(normalizeNativeShareTargetConversationId({ conversationId: '' })).toBeNull();
  });
});

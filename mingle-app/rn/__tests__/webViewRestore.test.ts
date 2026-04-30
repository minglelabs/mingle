import {
  buildConversationRestoreWebUrl,
  classifyConversationWebUrl,
  readNativeConversationRestorePayload,
  resolveConversationRestorePayloadFromUrl,
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
    expect(buildConversationRestoreWebUrl(
      'https://mingle.example/ko?nativeStt=1&nativeUi=1&apiNamespace=ios%2Fv1.1.3&nativeListTopInsetPx=50',
      'https://mingle.example/en/conversations?conversation=conv_2&nativeUi=1&oldParam=1',
    )).toBe(
      'https://mingle.example/ko/conversations?nativeStt=1&nativeUi=1&apiNamespace=ios%2Fv1.1.3&nativeListTopInsetPx=50&conversation=conv_2',
    );
  });

  it('ignores expired or inconsistent native restore payloads', () => {
    expect(readNativeConversationRestorePayload({
      conversationRestoreUrl: 'https://mingle.example/en/conversations?conversation=conv_1',
      conversationRestoreConversationId: 'conv_1',
      conversationRestoreCreatedAtMs: 1000,
    }, 1000 + 30 * 60 * 1000)).toEqual({
      url: 'https://mingle.example/en/conversations?conversation=conv_1',
      conversationId: 'conv_1',
      createdAtMs: 1000,
    });

    expect(readNativeConversationRestorePayload({
      conversationRestoreUrl: 'https://mingle.example/en/conversations?conversation=conv_1',
      conversationRestoreConversationId: 'conv_1',
      conversationRestoreCreatedAtMs: 1000,
    }, 1000 + 30 * 60 * 1000 + 1)).toBeNull();

    expect(readNativeConversationRestorePayload({
      conversationRestoreUrl: 'https://mingle.example/en/conversations?conversation=conv_1',
      conversationRestoreConversationId: 'conv_2',
      conversationRestoreCreatedAtMs: 1000,
    }, 2000)).toBeNull();
  });
});

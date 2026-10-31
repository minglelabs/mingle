import {
  NATIVE_VOICE_EVENT,
  buildVoiceEventScript,
  parseVoiceBridgeCommand,
} from './voiceBridge';

describe('parseVoiceBridgeCommand', () => {
  it('parses open with payload', () => {
    expect(
      parseVoiceBridgeCommand({ type: 'native_voice_open', payload: { conversationId: 'c1', title: 'Room', interpret: false } }),
    ).toEqual({ type: 'native_voice_open', payload: { conversationId: 'c1', title: 'Room', lang: undefined, interpret: false } });
  });
  it('rejects open without a conversationId', () => {
    expect(parseVoiceBridgeCommand({ type: 'native_voice_open', payload: {} })).toBeNull();
  });
  it('parses close', () => {
    expect(parseVoiceBridgeCommand({ type: 'native_voice_close' })).toEqual({ type: 'native_voice_close' });
  });
  it('parses status_request', () => {
    expect(parseVoiceBridgeCommand({ type: 'native_voice_status_request', payload: { conversationId: 'c2' } })).toEqual({
      type: 'native_voice_status_request',
      payload: { conversationId: 'c2' },
    });
  });
  it('ignores unrelated commands', () => {
    expect(parseVoiceBridgeCommand({ type: 'native_tts_play' })).toBeNull();
    expect(parseVoiceBridgeCommand(null)).toBeNull();
  });
});

describe('buildVoiceEventScript', () => {
  it('dispatches a CustomEvent on the voice channel', () => {
    const script = buildVoiceEventScript({ type: 'state', phase: 'connected', conversationId: 'c1' });
    expect(script).toContain(NATIVE_VOICE_EVENT);
    expect(script).toContain('"phase":"connected"');
    expect(script.trim().endsWith('true;')).toBe(true);
  });
});

import {
  NATIVE_TTS_EARPHONES_DISCONNECTED_REASON,
  buildNativeTtsStoppedEvent,
  normalizeNativeTtsPlayResult,
  playNativeTts,
  resolveNativeTtsPlayRequest,
  resolveNativeTtsStartedEvent,
} from '../src/nativeTts';

type MockTtsModule = {
  play: jest.Mock;
};

const ReactNative = jest.requireMock('react-native') as {
  NativeModules: { NativeTTSModule: MockTtsModule };
};

describe('native_tts_play request (contract A.5 passthrough)', () => {
  it('forwards stopOnEarphoneDisconnect only when it is exactly true', () => {
    const base = { utteranceId: 'utt-1', audioBase64: 'AAAA' };
    expect(resolveNativeTtsPlayRequest({ ...base, stopOnEarphoneDisconnect: true })).toEqual({
      utteranceId: 'utt-1',
      playbackId: 'utt-1',
      audioBase64: 'AAAA',
      stopOnEarphoneDisconnect: true,
    });
    expect(resolveNativeTtsPlayRequest(base).stopOnEarphoneDisconnect).toBe(false);
    expect(resolveNativeTtsPlayRequest({ ...base, stopOnEarphoneDisconnect: false }).stopOnEarphoneDisconnect).toBe(false);
    expect(resolveNativeTtsPlayRequest({
      ...base,
      stopOnEarphoneDisconnect: 'true' as unknown as boolean,
    }).stopOnEarphoneDisconnect).toBe(false);
  });

  it('keeps the existing playbackId fallback', () => {
    expect(resolveNativeTtsPlayRequest({ utteranceId: 'utt-1', playbackId: '  pb-9 ', audioBase64: '' }).playbackId).toBe('pb-9');
    expect(resolveNativeTtsPlayRequest({ utteranceId: 'utt-1', playbackId: '   ', audioBase64: '' }).playbackId).toBe('utt-1');
  });

  it('hands the flag to NativeTTSModule.play and reports whether the clip started', async () => {
    const play = ReactNative.NativeModules.NativeTTSModule.play;
    play.mockClear();
    const request = resolveNativeTtsPlayRequest({
      utteranceId: 'utt-1',
      playbackId: 'pb-1',
      audioBase64: 'AAAA',
      stopOnEarphoneDisconnect: true,
    });

    await expect(playNativeTts(request)).resolves.toEqual({ ok: true });
    expect(play).toHaveBeenCalledWith({
      utteranceId: 'utt-1',
      playbackId: 'pb-1',
      audioBase64: 'AAAA',
      stopOnEarphoneDisconnect: true,
    });

    play.mockResolvedValueOnce({ ok: false, reason: NATIVE_TTS_EARPHONES_DISCONNECTED_REASON });
    await expect(playNativeTts(request)).resolves.toEqual({
      ok: false,
      reason: 'earphones_disconnected',
    });
  });

  it('treats anything but an explicit ok:false as started (older native builds)', () => {
    expect(normalizeNativeTtsPlayResult(undefined)).toEqual({ ok: true });
    expect(normalizeNativeTtsPlayResult({ ok: true })).toEqual({ ok: true });
    expect(normalizeNativeTtsPlayResult({ ok: false })).toEqual({ ok: false });
  });
});

describe('tts_started (contract A.3)', () => {
  const request = { playbackId: 'pb-1', utteranceId: 'utt-1' };

  it('uses the same id fields as tts_ended', () => {
    expect(resolveNativeTtsStartedEvent({ ok: true }, request, { ...request })).toEqual({
      type: 'tts_started',
      playbackId: 'pb-1',
      utteranceId: 'utt-1',
    });
  });

  it('is not sent for a clip that did not start or is no longer current', () => {
    expect(resolveNativeTtsStartedEvent({ ok: false, reason: 'earphones_disconnected' }, request, { ...request })).toBeNull();
    expect(resolveNativeTtsStartedEvent({ ok: true }, request, null)).toBeNull();
    expect(resolveNativeTtsStartedEvent({ ok: true }, request, { playbackId: 'pb-2', utteranceId: 'utt-2' })).toBeNull();
  });
});

describe('tts_stopped reason (contract A.5)', () => {
  it('carries earphones_disconnected from the native guard', () => {
    expect(buildNativeTtsStoppedEvent({ playbackId: 'pb-1', utteranceId: 'utt-1' }, 'earphones_disconnected')).toEqual({
      type: 'tts_stopped',
      utteranceId: 'utt-1',
      playbackId: 'pb-1',
      reason: 'earphones_disconnected',
    });
  });

  it('stays exactly as today for an ordinary stop', () => {
    const stopped = buildNativeTtsStoppedEvent({ playbackId: '', utteranceId: '' });
    expect(stopped).toEqual({ type: 'tts_stopped', utteranceId: '', playbackId: '' });
    expect('reason' in stopped).toBe(false);
    expect('reason' in buildNativeTtsStoppedEvent({ playbackId: 'pb', utteranceId: 'u' }, '  ')).toBe(false);
  });
});

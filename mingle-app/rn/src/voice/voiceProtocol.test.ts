import {
  DUCK_ORIG_DYNAMIC_LOW,
  DUCK_ORIG_STATIC,
  applyCaption,
  captionLinesNewestFirst,
  createCaptionStore,
  decodeCaptionPayload,
  decodeUtf8,
  isInterpreterParticipant,
  originalVolume,
  parseCaptionMessage,
  shouldSubscribe,
  volumeForTrack,
  type VoiceParticipantView,
  type VolumeState,
} from './voiceProtocol';

// Jest runs on Node, which has TextEncoder; the RN tsconfig has no DOM lib.
declare const TextEncoder: { new (): { encode: (s: string) => Uint8Array } };

describe('decodeUtf8', () => {
  it('decodes multi-byte text without TextDecoder', () => {
    const text = '안녕 こんにちは é 😀';
    expect(decodeUtf8(new TextEncoder().encode(text))).toBe(text);
  });
});

describe('isInterpreterParticipant', () => {
  it('detects by role attribute', () => {
    expect(isInterpreterParticipant({ identity: 'x', attributes: { role: 'interpreter' } })).toBe(true);
  });
  it('detects by identity prefix', () => {
    expect(isInterpreterParticipant({ identity: 'interpreter-voice-abc' })).toBe(true);
  });
  it('is false for a human', () => {
    expect(isInterpreterParticipant({ identity: 'user_1', attributes: { lang: 'ko' } })).toBe(false);
  });
});

describe('shouldSubscribe', () => {
  const human: VoiceParticipantView = { identity: 'u1', attributes: { lang: 'ko' } };
  const agent: VoiceParticipantView = { identity: 'interpreter-r', attributes: { role: 'interpreter' } };

  it('never subscribes non-audio', () => {
    expect(shouldSubscribe({ kind: 'video' }, human, { interpretOn: true, myLang: 'ja' })).toBe(false);
  });
  it('always subscribes human audio', () => {
    expect(shouldSubscribe({ kind: 'audio', trackName: 'mic' }, human, { interpretOn: false, myLang: 'ja' })).toBe(true);
  });
  it('subscribes only my-language interpreter lane when interpret ON', () => {
    expect(shouldSubscribe({ kind: 'audio', trackName: 'tr:ja' }, agent, { interpretOn: true, myLang: 'ja' })).toBe(true);
    expect(shouldSubscribe({ kind: 'audio', trackName: 'tr:en' }, agent, { interpretOn: true, myLang: 'ja' })).toBe(false);
  });
  it('never subscribes interpreter lane when interpret OFF', () => {
    expect(shouldSubscribe({ kind: 'audio', trackName: 'tr:ja' }, agent, { interpretOn: false, myLang: 'ja' })).toBe(false);
  });
});

describe('volume mix', () => {
  const base: VolumeState = {
    interpretOn: true,
    myLang: 'ja',
    mode: 'static',
    origVol: DUCK_ORIG_STATIC,
    trVol: 1,
    lanePlaying: false,
  };
  const other: VoiceParticipantView = { identity: 'u1', attributes: { lang: 'ko' } };
  const sameLang: VoiceParticipantView = { identity: 'u2', attributes: { lang: 'ja' } };
  const agent: VoiceParticipantView = { identity: 'interpreter-r', attributes: { role: 'interpreter' } };

  it('interpret OFF = full original', () => {
    expect(originalVolume(other, { ...base, interpretOn: false })).toBe(1);
  });

  it('interpret OFF, room reading aloud = other languages quiet, mine full', () => {
    expect(originalVolume(other, { ...base, interpretOn: false, readingAloud: true })).toBe(DUCK_ORIG_STATIC);
    expect(originalVolume(sameLang, { ...base, interpretOn: false, readingAloud: true })).toBe(1);
  });
  it('same language speaker = full original', () => {
    expect(originalVolume(sameLang, base)).toBe(1);
  });
  it('static mode uses origVol', () => {
    expect(originalVolume(other, base)).toBe(DUCK_ORIG_STATIC);
  });
  it('dynamic mode ducks only while lane playing', () => {
    expect(originalVolume(other, { ...base, mode: 'dynamic', lanePlaying: false })).toBe(1);
    expect(originalVolume(other, { ...base, mode: 'dynamic', lanePlaying: true })).toBe(DUCK_ORIG_DYNAMIC_LOW);
  });
  it('agent track always uses trVol', () => {
    expect(volumeForTrack(agent, { ...base, trVol: 0.8 })).toBe(0.8);
  });
});

describe('parseCaptionMessage', () => {
  it('parses partial', () => {
    expect(parseCaptionMessage({ type: 'partial', id: 'p1', text: 'hi', lang: 'ko' })).toEqual({
      type: 'partial', id: 'p1', text: 'hi', lang: 'ko', speaker: undefined, speakerName: undefined,
    });
  });
  it('rejects partial without id/text', () => {
    expect(parseCaptionMessage({ type: 'partial', id: 'p1' })).toBeNull();
    expect(parseCaptionMessage({ type: 'partial', text: 'x' })).toBeNull();
  });
  it('parses lane', () => {
    expect(parseCaptionMessage({ type: 'lane', lang: 'ja', playing: true })).toEqual({
      type: 'lane', lang: 'ja', playing: true,
    });
  });
  it('rejects lane without boolean playing', () => {
    expect(parseCaptionMessage({ type: 'lane', lang: 'ja', playing: 'yes' })).toBeNull();
  });
  it('parses translation + play + error', () => {
    expect(parseCaptionMessage({ type: 'translation', id: 'f1', lang: 'ja', text: 't' })?.type).toBe('translation');
    expect(parseCaptionMessage({ type: 'play', id: 'f1', lang: 'ja', metrics: { speechEndToPlayMs: 2400 } })?.type).toBe('play');
    expect(parseCaptionMessage({ type: 'error', id: 'f1', lang: 'ja', message: 'boom' })?.type).toBe('error');
  });
  it('rejects unknown type and non-object', () => {
    expect(parseCaptionMessage({ type: 'nope' })).toBeNull();
    expect(parseCaptionMessage(null)).toBeNull();
    expect(parseCaptionMessage(42)).toBeNull();
  });
});

describe('decodeCaptionPayload', () => {
  it('decodes a UTF-8 JSON payload (incl. Korean)', () => {
    const json = JSON.stringify({ type: 'final', id: 'f1', text: '안녕하세요', lang: 'ko' });
    const bytes = new TextEncoder().encode(json);
    const msg = decodeCaptionPayload(bytes);
    expect(msg).toMatchObject({ type: 'final', id: 'f1', text: '안녕하세요' });
  });
  it('returns null on malformed JSON', () => {
    expect(decodeCaptionPayload(new TextEncoder().encode('{bad'))).toBeNull();
  });
});

describe('caption store', () => {
  it('promotes a partial to a final and keeps translations landing after remap', () => {
    const store = createCaptionStore();
    applyCaption(store, { type: 'partial', id: 'p1', text: 'annyeong', lang: 'ko', speakerName: 'Mia' }, 'ja');
    expect(store.lines.get('p1')?.isPartial).toBe(true);

    applyCaption(store, { type: 'final', id: 'f1', partialId: 'p1', text: 'annyeong', lang: 'ko', speakerName: 'Mia' }, 'ja');
    expect(store.lines.has('p1')).toBe(false);
    expect(store.lines.get('f1')?.isPartial).toBe(false);

    // A translation that still references the final id lands.
    applyCaption(store, { type: 'translation', id: 'f1', lang: 'ja', text: 'こんにちは' }, 'ja');
    expect(store.lines.get('f1')?.translations.ja).toBe('こんにちは');

    // A late translation keyed by the OLD partial id is remapped via partialToId.
    applyCaption(store, { type: 'translation', id: 'p1', lang: 'en', text: 'hello' }, 'ja');
    expect(store.lines.get('f1')?.translations.en).toBe('hello');
  });

  it('attaches play metrics only for my language', () => {
    const store = createCaptionStore();
    applyCaption(store, { type: 'final', id: 'f1', text: 'x', lang: 'ko' }, 'ja');
    expect(applyCaption(store, { type: 'play', id: 'f1', lang: 'en', metrics: { speechEndToPlayMs: 1 } }, 'ja')).toBeNull();
    expect(applyCaption(store, { type: 'play', id: 'f1', lang: 'ja', metrics: { speechEndToPlayMs: 2400 } }, 'ja')).toBe('f1');
    expect(store.lines.get('f1')?.metrics?.speechEndToPlayMs).toBe(2400);
  });

  it('flags echoes', () => {
    const store = createCaptionStore();
    applyCaption(store, { type: 'echo', id: 'e1', text: 'x', lang: 'ko' }, 'ja');
    expect(store.lines.get('e1')?.isEcho).toBe(true);
  });

  it('returns lines newest-first and capped', () => {
    const store = createCaptionStore();
    for (let i = 0; i < 5; i += 1) {
      applyCaption(store, { type: 'final', id: `f${i}`, text: `t${i}`, lang: 'ko' }, 'ja');
    }
    const lines = captionLinesNewestFirst(store, 3);
    expect(lines.map((l) => l.id)).toEqual(['f4', 'f3', 'f2']);
  });
});

describe('call volume', () => {
  it('scales every voice by the viewer\'s call volume, down to silence', () => {
    const speaker = { identity: 'u1', attributes: { lang: 'ko' } };
    const base = { interpretOn: false, myLang: 'ja', mode: 'static' as const, origVol: 0.25, trVol: 1, lanePlaying: false };
    expect(volumeForTrack(speaker, base)).toBe(1);
    expect(volumeForTrack(speaker, { ...base, callVol: 0.4 })).toBeCloseTo(0.4);
    expect(volumeForTrack(speaker, { ...base, callVol: 0.4, readingAloud: true })).toBeCloseTo(0.1);
    expect(volumeForTrack(speaker, { ...base, callVol: 0 })).toBe(0);
    expect(volumeForTrack(speaker, { ...base, callVol: 3 })).toBe(1);
  });
});

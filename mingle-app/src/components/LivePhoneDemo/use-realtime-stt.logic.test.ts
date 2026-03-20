import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  appendFinalizedUtteranceToStoreState,
  applyTranslationToUtteranceStoreState,
  buildLiveTranslateRequestSignature,
  buildFinalizedUtterancePayload,
  createUtteranceStoreState,
  findRecentMatchingUtteranceIndex,
  getWsUrl,
  isDuplicateTimedSignature,
  parseSttTranscriptMessage,
  pruneUnresolvedTranslationTargets,
  shouldApplyLatestPartialTranslationResponse,
  shouldApplyPartialTranslationResponse,
  shouldOverrideTranslationByPriority,
} from './use-realtime-stt'

describe('use-realtime-stt pure logic', () => {
  const originalWsUrl = process.env.NEXT_PUBLIC_WS_URL

  afterEach(() => {
    if (originalWsUrl === undefined) {
      delete process.env.NEXT_PUBLIC_WS_URL
    } else {
      process.env.NEXT_PUBLIC_WS_URL = originalWsUrl
    }
    vi.unstubAllGlobals()
  })

  it('prefers NEXT_PUBLIC_WS_URL over inferred ws URL', () => {
    process.env.NEXT_PUBLIC_WS_URL = 'wss://97e1-183-96-5-234.ngrok-free.app'
    vi.stubGlobal('window', {
      location: {
        hostname: 'localhost',
        protocol: 'http:',
      },
    })

    expect(getWsUrl()).toBe('wss://97e1-183-96-5-234.ngrok-free.app')
  })

  it('infers ws/wss from page protocol when env override is absent', () => {
    delete process.env.NEXT_PUBLIC_WS_URL

    vi.stubGlobal('window', {
      location: {
        hostname: 'mingle.local',
        protocol: 'http:',
      },
    })
    expect(getWsUrl()).toBe('ws://mingle.local:3001')

    vi.stubGlobal('window', {
      location: {
        hostname: 'mingle.app',
        protocol: 'https:',
      },
    })
    expect(getWsUrl()).toBe('wss://mingle.app:3001')
  })

  it('parses transcript message payload and normalizes text', () => {
    const parsed = parseSttTranscriptMessage({
      type: 'transcript',
      data: {
        is_final: true,
        utterance: {
          text: ' <fin> ... Hello there ',
          language: 'en-US',
          speaker: 'speaker-2',
        },
      },
    })

    expect(parsed).toEqual({
      rawText: ' <fin> ... Hello there ',
      text: 'Hello there',
      language: 'en-US',
      isFinal: true,
      speaker: 'speaker-2',
    })
  })

  it('returns null for malformed non-transcript payloads', () => {
    expect(parseSttTranscriptMessage({ type: 'ready' })).toBeNull()
    expect(parseSttTranscriptMessage({ type: 'transcript', data: null })).toBeNull()
    expect(parseSttTranscriptMessage({ type: 'transcript', data: { utterance: null } })).toBeNull()
  })

  it('builds finalized utterance payload with source-language filtering', () => {
    const built = buildFinalizedUtterancePayload({
      rawText: ' <end> hello everyone ',
      rawLanguage: 'en-US',
      languages: ['en', 'ko', 'ja', 'KO'],
      partialTranslations: {
        en: 'self',
        ko: ' 안녕하세요 ',
        ja: ' こんにちは ',
        blank: '   ',
      },
      utteranceSerial: 7,
      nowMs: 1700000000000,
    })

    expect(built).not.toBeNull()
    expect(built?.utteranceId).toBe('u-1700000000000-7')
    expect(built?.text).toBe('hello everyone')
    expect(built?.language).toBe('en-US')
    expect(built?.utterance).toEqual({
      id: 'u-1700000000000-7',
      originalText: 'hello everyone',
      originalLang: 'en-US',
      targetLanguages: ['ko', 'ja'],
      translations: {
        ko: '안녕하세요',
        ja: 'こんにちは',
      },
      translationFinalized: {
        ko: false,
        ja: false,
      },
      createdAtMs: 1700000000000,
    })
    expect(built?.currentTurnPreviousState).toEqual({
      sourceLanguage: 'en-US',
      sourceText: 'hello everyone',
      translations: {
        ko: '안녕하세요',
        ja: 'こんにちは',
      },
    })
  })

  it('returns null when final text is only markers/noise', () => {
    const built = buildFinalizedUtterancePayload({
      rawText: ' <fin> ... ',
      rawLanguage: 'ko',
      languages: ['ko', 'en'],
      partialTranslations: {},
      utteranceSerial: 1,
      nowMs: 1700000000000,
    })

    expect(built).toBeNull()
  })

  it('can keep finalized utterance translations pending while still keeping prior turn context', () => {
    const built = buildFinalizedUtterancePayload({
      rawText: ' hello everyone ',
      rawLanguage: 'en-US',
      languages: ['en', 'ko', 'ja'],
      partialTranslations: {},
      currentTurnPreviousTranslations: {
        ko: ' 안녕하세요 ',
        ja: ' こんにちは ',
      },
      seedUtteranceTranslations: false,
      utteranceSerial: 8,
      nowMs: 1700000000001,
    })

    expect(built).not.toBeNull()
    expect(built?.utterance.translations).toEqual({})
    expect(built?.utterance.translationFinalized).toEqual({})
    expect(built?.utterance.targetLanguages).toEqual(['ko', 'ja'])
    expect(built?.currentTurnPreviousState).toEqual({
      sourceLanguage: 'en-US',
      sourceText: 'hello everyone',
      translations: {
        ko: '안녕하세요',
        ja: 'こんにちは',
      },
    })
  })

  it('merges queued translation updates when the finalized utterance is appended later', () => {
    const queued = applyTranslationToUtteranceStoreState({
      store: createUtteranceStoreState([]),
      utteranceId: 'u-queued',
      translations: {
        ko: '그리고 저는 해고되었습니다.',
        ja: 'そして私は解雇されました。',
      },
      priority: { kind: 'final', seq: 7 },
      markFinalized: true,
    })

    const appended = appendFinalizedUtteranceToStoreState(queued, {
      id: 'u-queued',
      originalText: 'And then I got fired.',
      originalLang: 'en',
      targetLanguages: ['ko', 'ja'],
      translations: {},
      translationFinalized: {},
      createdAtMs: 1700000000002,
    })

    expect(appended.pendingTranslationUpdates.size).toBe(0)
    expect(appended.utterances).toEqual([
      {
        id: 'u-queued',
        originalText: 'And then I got fired.',
        originalLang: 'en',
        targetLanguages: ['ko', 'ja'],
        translations: {
          ko: '그리고 저는 해고되었습니다.',
          ja: 'そして私は解雇されました。',
        },
        translationFinalized: {
          ko: true,
          ja: true,
        },
        createdAtMs: 1700000000002,
      },
    ])
    expect(appended.translationPriorities.get('u-queued:ko')).toEqual({ kind: 'final', seq: 7 })
    expect(appended.translationPriorities.get('u-queued:ja')).toEqual({ kind: 'final', seq: 7 })
  })

  it('keeps visible partial translations seeded on the finalized utterance', () => {
    const appended = appendFinalizedUtteranceToStoreState(
      createUtteranceStoreState([]),
      {
        id: 'u-seeded',
        originalText: 'And eventually we had a falling out. When we did, our—',
        originalLang: 'en',
        targetLanguages: ['ko', 'ja'],
        translations: {
          ko: '그리고 결국 우리는 사이가 틀어졌어요. 그때',
          ja: 'そして最終的に私たちは仲たがいしました。その時',
        },
        translationFinalized: {
          ko: false,
          ja: false,
        },
        createdAtMs: 1700000000004,
      },
      {
        translations: {
          ko: '그리고 결국 우리는 사이가 틀어졌어요. 그때',
          ja: 'そして最終的に私たちは仲たがいしました。その時',
        },
        priorities: new Map([
          ['ko', { kind: 'partial', seq: 3 }],
          ['ja', { kind: 'partial', seq: 3 }],
        ]),
      },
    )

    expect(appended.utterances[0].translations).toEqual({
      ko: '그리고 결국 우리는 사이가 틀어졌어요. 그때',
      ja: 'そして最終的に私たちは仲たがいしました。その時',
    })
    expect(appended.utterances[0].translationFinalized).toEqual({})
    expect(appended.translationPriorities.get('u-seeded:ko')).toEqual({ kind: 'partial', seq: 3 })
    expect(appended.translationPriorities.get('u-seeded:ja')).toEqual({ kind: 'partial', seq: 3 })
  })

  it('does not let an older queued partial override a seeded newer partial', () => {
    const queuedOlderPartial = applyTranslationToUtteranceStoreState({
      store: createUtteranceStoreState([]),
      utteranceId: 'u-seeded',
      translations: {
        ko: '그리고',
      },
      priority: { kind: 'partial', seq: 1 },
      markFinalized: false,
    })

    const appended = appendFinalizedUtteranceToStoreState(
      queuedOlderPartial,
      {
        id: 'u-seeded',
        originalText: 'And eventually we had',
        originalLang: 'en',
        targetLanguages: ['ko', 'ja'],
        translations: {
          ko: '그리고 결국 우리는',
        },
        translationFinalized: {
          ko: false,
        },
        createdAtMs: 1700000000005,
      },
      {
        translations: {
          ko: '그리고 결국 우리는',
        },
        priorities: new Map([
          ['ko', { kind: 'partial', seq: 2 }],
        ]),
      },
    )

    expect(appended.utterances[0].translations.ko).toBe('그리고 결국 우리는')
    expect(appended.translationPriorities.get('u-seeded:ko')).toEqual({ kind: 'partial', seq: 2 })
  })

  it('stores fallback-applied priorities under the matched utterance id', () => {
    const store = createUtteranceStoreState([
      {
        id: 'u-real',
        originalText: 'How can you get fired from a company you started?',
        originalLang: 'en',
        targetLanguages: ['ko', 'ja'],
        translations: {},
        translationFinalized: {},
        createdAtMs: 1700000000003,
      },
    ])

    const updated = applyTranslationToUtteranceStoreState({
      store,
      utteranceId: 'u-missing',
      translations: {
        ko: '자신이 세운 회사에서 어떻게 해고될 수 있나요?',
        ja: '自分で立ち上げた会社からどうやって解雇されるのか？',
      },
      priority: { kind: 'final', seq: 9 },
      markFinalized: true,
      fallbackMatch: {
        sourceText: 'How can you get fired from a company you started?',
        sourceLanguage: 'en',
      },
    })

    expect(updated.pendingTranslationUpdates.size).toBe(0)
    expect(updated.translationPriorities.get('u-real:ko')).toEqual({ kind: 'final', seq: 9 })
    expect(updated.translationPriorities.get('u-real:ja')).toEqual({ kind: 'final', seq: 9 })
    expect(updated.translationPriorities.has('u-missing:ko')).toBe(false)
    expect(updated.utterances[0].translations).toEqual({
      ko: '자신이 세운 회사에서 어떻게 해고될 수 있나요?',
      ja: '自分で立ち上げた会社からどうやって解雇されるのか？',
    })
  })

  it('builds stable translate request signatures for duplicate-request dedupe', () => {
    expect(buildLiveTranslateRequestSignature({
      utteranceId: 12,
      speaker: 'speaker-1',
      language: 'en',
      text: 'Hello world',
    })).toBe('12::speaker-1::en::Hello world')

    expect(buildLiveTranslateRequestSignature({
      utteranceId: 12,
      speaker: '',
      language: 'en',
      text: '  Hello world  ',
    })).toBe('12::unknown::en::Hello world')
  })

  it('detects duplicate timed signatures within the ttl window', () => {
    expect(isDuplicateTimedSignature({
      previousSig: 'speaker-1::en::hello',
      previousExpiresAt: 2_000,
      nextSig: 'speaker-1::en::hello',
      nowMs: 1_500,
    })).toBe(true)

    expect(isDuplicateTimedSignature({
      previousSig: 'speaker-1::en::hello',
      previousExpiresAt: 2_000,
      nextSig: 'speaker-1::en::hello',
      nowMs: 2_500,
    })).toBe(false)

    expect(isDuplicateTimedSignature({
      previousSig: 'speaker-1::en::hello',
      previousExpiresAt: 2_000,
      nextSig: 'speaker-2::en::hello',
      nowMs: 1_500,
    })).toBe(false)
  })

  it('finds the most recent utterance matching source text and language', () => {
    expect(findRecentMatchingUtteranceIndex({
      utterances: [
        {
          id: 'u-1',
          originalText: 'Hello',
          originalLang: 'en',
          translations: {},
        },
        {
          id: 'u-2',
          originalText: 'Hello',
          originalLang: 'ko',
          translations: {},
        },
        {
          id: 'u-3',
          originalText: 'Hello',
          originalLang: 'en-US',
          translations: {},
        },
      ],
      sourceText: ' Hello ',
      sourceLanguage: 'en',
    })).toBe(2)

    expect(findRecentMatchingUtteranceIndex({
      utterances: [
        {
          id: 'u-1',
          originalText: 'Hello',
          originalLang: 'en',
          translations: {},
        },
      ],
      sourceText: 'Goodbye',
      sourceLanguage: 'en',
    })).toBe(-1)
  })

  it('accepts partial translation responses only for the active turn and speaker', () => {
    expect(shouldApplyPartialTranslationResponse({
      requestUtteranceId: 9,
      currentUtteranceId: 9,
      requestSpeaker: 'speaker-1',
      currentSpeaker: 'speaker-1',
    })).toBe(true)

    expect(shouldApplyPartialTranslationResponse({
      requestUtteranceId: 9,
      currentUtteranceId: 10,
      requestSpeaker: 'speaker-1',
      currentSpeaker: 'speaker-1',
    })).toBe(false)

    expect(shouldApplyPartialTranslationResponse({
      requestUtteranceId: 9,
      currentUtteranceId: 9,
      requestSpeaker: 'speaker-1',
      currentSpeaker: 'speaker-2',
    })).toBe(false)
  })

  it('accepts only the latest non-aborted partial translation response', () => {
    expect(shouldApplyLatestPartialTranslationResponse({
      requestUtteranceId: 9,
      currentUtteranceId: 9,
      requestSpeaker: 'speaker-1',
      currentSpeaker: 'speaker-1',
      requestSeq: 3,
      latestRequestSeq: 3,
      aborted: false,
    })).toBe(true)

    expect(shouldApplyLatestPartialTranslationResponse({
      requestUtteranceId: 9,
      currentUtteranceId: 9,
      requestSpeaker: 'speaker-1',
      currentSpeaker: 'speaker-1',
      requestSeq: 2,
      latestRequestSeq: 3,
      aborted: false,
    })).toBe(false)

    expect(shouldApplyLatestPartialTranslationResponse({
      requestUtteranceId: 9,
      currentUtteranceId: 9,
      requestSpeaker: 'speaker-1',
      currentSpeaker: 'speaker-1',
      requestSeq: 3,
      latestRequestSeq: 3,
      aborted: true,
    })).toBe(false)
  })

  it('prioritizes final over partial and newer partial over older ones', () => {
    expect(shouldOverrideTranslationByPriority(undefined, { kind: 'initial', seq: 1 })).toBe(true)
    expect(shouldOverrideTranslationByPriority(
      { kind: 'initial', seq: 1 },
      { kind: 'partial', seq: 2 },
    )).toBe(true)
    expect(shouldOverrideTranslationByPriority(
      { kind: 'partial', seq: 3 },
      { kind: 'partial', seq: 2 },
    )).toBe(false)
    expect(shouldOverrideTranslationByPriority(
      { kind: 'partial', seq: 99 },
      { kind: 'final', seq: 1 },
    )).toBe(true)
    expect(shouldOverrideTranslationByPriority(
      { kind: 'final', seq: 3 },
      { kind: 'partial', seq: 999 },
    )).toBe(false)
  })

  it('prunes unresolved target languages after the final translation attempt settles', () => {
    expect(pruneUnresolvedTranslationTargets({
      targetLanguages: ['ko', 'ja'],
      translations: {
        ko: '안녕하세요',
        ja: '   ',
      },
      translationFinalized: {
        ko: true,
        ja: false,
      },
    })).toEqual({
      targetLanguages: ['ko'],
      translations: {
        ko: '안녕하세요',
      },
      translationFinalized: {
        ko: true,
      },
    })
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildLanguageSelectionSignature,
  buildStorageKey,
  buildSonioxLanguageHints,
  appendFinalizedUtteranceToStoreState,
  buildLiveUtterance,
  buildLiveUtterances,
  applyTranslationToUtteranceStoreState,
  buildLiveTranslateRequestSignature,
  buildFinalizedUtterancePayload,
  classifyRecentFinalizedUtteranceMatch,
  createUtteranceStoreState,
  findRecentMatchingUtteranceIndex,
  getWsUrl,
  isDuplicateTimedSignature,
  filterTranslationsToTargetLanguages,
  getOrCreateSessionKey,
  getOrCreateTrackingUserId,
  mergeDisplayUtterances,
  resolveRenderedTtsCandidateFromUtterance,
  parseSttTranscriptMessage,
  parsePartialTranslateMode,
  parsePositiveIntWithFallback,
  pruneUnresolvedTranslationTargets,
  resolveNativeMicPermissionRecoveryAction,
  shouldApplyPendingTurnPartialTranslationResponse,
  shouldOpenNativeMicSettingsOnRetry,
  shouldRestartSttForLanguageHintChange,
  shouldTriggerPartialTranslate,
  shouldOverrideTranslationByPriority,
} from './use-realtime-stt'

function createLocalStorageMock(seed: Record<string, string> = {}) {
  const store = new Map(Object.entries(seed))
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size
    },
  }
}

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

  it('generates and persists a stable anonymous tracking user id in localStorage', () => {
    const localStorage = createLocalStorageMock()
    vi.stubGlobal('crypto', {
      randomUUID: () => '12345678-1234-1234-1234-123456789abc',
    })
    vi.stubGlobal('window', { localStorage })

    const first = getOrCreateTrackingUserId()
    const second = getOrCreateTrackingUserId()

    expect(first).toBe('anon_12345678123412341234123456789abc')
    expect(second).toBe(first)
    expect(localStorage.getItem('mingle_demo_tracking_user_id')).toBe(first)
  })

  it('reuses a previously persisted anonymous tracking user id', () => {
    const localStorage = createLocalStorageMock({
      mingle_demo_tracking_user_id: 'anon_existing_user',
    })
    vi.stubGlobal('window', { localStorage })

    expect(getOrCreateTrackingUserId()).toBe('anon_existing_user')
    expect(localStorage.getItem('mingle_demo_tracking_user_id')).toBe('anon_existing_user')
  })

  it('namespaces room-scoped storage keys', () => {
    expect(buildStorageKey('mingle_demo_session_key')).toBe('mingle_demo_session_key')
    expect(buildStorageKey('mingle_demo_session_key', 'room_1')).toBe('mingle_demo_session_key__room_1')
  })

  it('persists isolated session keys per room namespace', () => {
    const localStorage = createLocalStorageMock({
      mingle_demo_session_key__room_1: 'sess_room_1',
      mingle_demo_session_key__room_2: 'sess_room_2',
    })
    vi.stubGlobal('window', { localStorage })

    expect(getOrCreateSessionKey('room_1')).toBe('sess_room_1')
    expect(getOrCreateSessionKey('room_2')).toBe('sess_room_2')
  })

  it('prefers the conversation session override over localStorage state', () => {
    const localStorage = createLocalStorageMock({
      mingle_demo_session_key__room_1: 'sess_room_1',
    })
    vi.stubGlobal('window', { localStorage })

    expect(getOrCreateSessionKey('room_1', 'conv_override')).toBe('conv_override')
    expect(localStorage.getItem('mingle_demo_session_key__room_1')).toBe('sess_room_1')
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
      speaker: 'speaker-2',
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
      speaker: 'speaker-2',
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

  it('normalizes language selection signatures for target-language comparisons', () => {
    expect(buildLanguageSelectionSignature([' en ', 'ko', '', 'ja ']))
      .toBe(buildLanguageSelectionSignature(['en', 'ko', 'ja']))
  })

  it('changes language selection signatures when membership or order changes', () => {
    expect(buildLanguageSelectionSignature(['en', 'ko']))
      .not.toBe(buildLanguageSelectionSignature(['en', 'ja']))
    expect(buildLanguageSelectionSignature(['en', 'ko']))
      .not.toBe(buildLanguageSelectionSignature(['ko', 'en']))
  })

  it('normalizes Soniox language hints without blanks or duplicates', () => {
    expect(buildSonioxLanguageHints([' en ', '', 'ko', 'EN', 'ja '])).toEqual(['en', 'ko', 'ja'])
  })

  it('restarts STT on language change only when Soniox hints are enabled and ready', () => {
    expect(shouldRestartSttForLanguageHintChange({
      previousSelectionSignature: buildLanguageSelectionSignature(['en', 'ko']),
      nextSelectionSignature: buildLanguageSelectionSignature(['en', 'ja']),
      connectionStatus: 'ready',
      sonioxLanguageHintsEnabled: true,
    })).toBe(true)

    expect(shouldRestartSttForLanguageHintChange({
      previousSelectionSignature: buildLanguageSelectionSignature(['en', 'ko']),
      nextSelectionSignature: buildLanguageSelectionSignature(['en', 'ja']),
      connectionStatus: 'ready',
      sonioxLanguageHintsEnabled: false,
    })).toBe(false)

    expect(shouldRestartSttForLanguageHintChange({
      previousSelectionSignature: buildLanguageSelectionSignature(['en', 'ko']),
      nextSelectionSignature: buildLanguageSelectionSignature(['en', 'ko']),
      connectionStatus: 'ready',
      sonioxLanguageHintsEnabled: true,
    })).toBe(false)
  })

  it('maps iOS microphone denial errors to open-settings recovery', () => {
    expect(resolveNativeMicPermissionRecoveryAction({
      platform: 'ios',
      code: 'mic_permission',
      message: 'Microphone permission denied',
    })).toBe('open_ios_settings')

    expect(resolveNativeMicPermissionRecoveryAction({
      platform: 'ios',
      message: 'mic_permission_denied_after_prompt',
    })).toBe('open_ios_settings')

    expect(resolveNativeMicPermissionRecoveryAction({
      platform: 'ios',
      permission: 'denied',
    })).toBe('open_ios_settings')

    expect(resolveNativeMicPermissionRecoveryAction({
      platform: 'ios',
      permission: 'granted',
    })).toBe('none')

    expect(resolveNativeMicPermissionRecoveryAction({
      platform: 'android',
      code: 'mic_permission',
      message: 'Microphone permission denied',
    })).toBe('none')
  })

  it('opens native mic settings only for idle native iOS denial recovery', () => {
    expect(shouldOpenNativeMicSettingsOnRetry({
      useNativeStt: true,
      connectionStatus: 'idle',
      recoveryAction: 'open_ios_settings',
      supportsNativeOpenAppSettingsCommand: true,
    })).toBe(true)

    expect(shouldOpenNativeMicSettingsOnRetry({
      useNativeStt: true,
      connectionStatus: 'connecting',
      recoveryAction: 'open_ios_settings',
      supportsNativeOpenAppSettingsCommand: true,
    })).toBe(false)

    expect(shouldOpenNativeMicSettingsOnRetry({
      useNativeStt: false,
      connectionStatus: 'idle',
      recoveryAction: 'open_ios_settings',
      supportsNativeOpenAppSettingsCommand: true,
    })).toBe(false)

    expect(shouldOpenNativeMicSettingsOnRetry({
      useNativeStt: true,
      connectionStatus: 'idle',
      recoveryAction: 'open_ios_settings',
      supportsNativeOpenAppSettingsCommand: false,
    })).toBe(false)
  })

  it('filters translations down to currently selected target languages', () => {
    expect(filterTranslationsToTargetLanguages({
      ko: '안녕하세요',
      ja: 'こんにちは',
      en: 'hello',
    }, ['ja', 'en'])).toEqual({
      ja: 'こんにちは',
      en: 'hello',
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

  it('builds a live utterance with the speaker before finalization', () => {
    expect(buildLiveUtterance({
      pendingTurn: {
        utteranceId: 'u-live',
        createdAtMs: 1700000000999,
        speaker: 'speaker-2',
        speakerAvatarSeed: 'avatar_seed_a',
        speakerAvatarIndex: 7,
        language: 'en',
      },
      partialTranscript: 'Still speaking',
      partialLang: 'en-US',
      partialTranslations: {
        en: 'self',
        ko: '계속 말하는 중',
      },
      languages: ['en', 'ko'],
    })).toEqual({
      id: 'u-live',
      speaker: 'speaker-2',
      speakerAvatarSeed: 'avatar_seed_a',
      speakerAvatarIndex: 7,
      originalText: 'Still speaking',
      originalLang: 'en-US',
      targetLanguages: ['ko'],
      translations: {
        ko: '계속 말하는 중',
      },
      translationFinalized: {},
      createdAtMs: 1700000000999,
    })

    expect(buildLiveUtterance({
      pendingTurn: {
        utteranceId: 'u-live',
        createdAtMs: 1700000000999,
        speaker: 'speaker-2',
        speakerAvatarSeed: 'avatar_seed_a',
        speakerAvatarIndex: 7,
        language: 'en',
      },
      partialTranscript: '   ',
      partialTranslations: {},
      languages: ['en', 'ko'],
    })).toBeNull()
  })

  it('builds live utterances for all pending speakers in chronological order', () => {
    expect(buildLiveUtterances({
      pendingTurns: [
        {
          utteranceId: 'u-2',
          createdAtMs: 1700000000002,
          speaker: 'speaker-2',
          speakerAvatarSeed: 'avatar_seed_2',
          speakerAvatarIndex: 2,
          language: 'ko',
          text: 'Second draft updated',
          partialTranslations: {
            en: 'Updated second draft',
          },
        },
        {
          utteranceId: 'u-1',
          createdAtMs: 1700000000001,
          speaker: 'speaker-1',
          speakerAvatarSeed: 'avatar_seed_1',
          speakerAvatarIndex: 1,
          language: 'en',
          text: 'First draft',
          partialTranslations: {
            ko: '첫 번째 초안',
          },
        },
      ],
      languages: ['en', 'ko', 'ja'],
    })).toEqual([
      {
        id: 'u-1',
        speaker: 'speaker-1',
        speakerAvatarSeed: 'avatar_seed_1',
        speakerAvatarIndex: 1,
        originalText: 'First draft',
        originalLang: 'en',
        targetLanguages: ['ko', 'ja'],
        translations: {
          ko: '첫 번째 초안',
        },
        translationFinalized: {},
        createdAtMs: 1700000000001,
      },
      {
        id: 'u-2',
        speaker: 'speaker-2',
        speakerAvatarSeed: 'avatar_seed_2',
        speakerAvatarIndex: 2,
        originalText: 'Second draft updated',
        originalLang: 'ko',
        targetLanguages: ['en', 'ja'],
        translations: {
          en: 'Updated second draft',
        },
        translationFinalized: {},
        createdAtMs: 1700000000002,
      },
    ])
  })

  it('keeps speaker avatar seed on finalized utterances when provided', () => {
    const built = buildFinalizedUtterancePayload({
      speaker: 'speaker-2',
      speakerAvatarSeed: 'avatar_seed_a',
      speakerAvatarIndex: 7,
      rawText: ' hello everyone ',
      rawLanguage: 'en-US',
      languages: ['en', 'ko'],
      partialTranslations: {},
      utteranceSerial: 9,
      nowMs: 1700000000009,
    })

    expect(built?.utterance.speakerAvatarSeed).toBe('avatar_seed_a')
    expect(built?.utterance.speakerAvatarIndex).toBe(7)
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

  it('preserves source-language correction metadata when a finalized translation is queued before append', () => {
    const queued = applyTranslationToUtteranceStoreState({
      store: createUtteranceStoreState([]),
      utteranceId: 'u-race-corrected',
      translations: {
        ko: '안녕하세요',
        ja: 'こんにちは',
        en: 'Hello',
      },
      priority: { kind: 'final', seq: 8 },
      markFinalized: true,
      detectedSourceLanguage: 'ko',
      selectedLanguages: ['en', 'ja', 'ko'],
      sourceText: '안녕하세요',
    })

    const appended = appendFinalizedUtteranceToStoreState(queued, {
      id: 'u-race-corrected',
      originalText: '안녕하세요',
      originalLang: 'ja',
      targetLanguages: ['en', 'ko'],
      translations: {},
      translationFinalized: {},
      createdAtMs: 1700000000003,
    })

    expect(appended.pendingTranslationUpdates.size).toBe(0)
    expect(appended.utterances).toEqual([
      {
        id: 'u-race-corrected',
        originalText: '안녕하세요',
        originalLang: 'ko',
        targetLanguages: ['en', 'ja'],
        translations: {
          en: 'Hello',
          ja: 'こんにちは',
        },
        translationFinalized: {
          en: true,
          ja: true,
        },
        createdAtMs: 1700000000003,
      },
    ])
    expect(appended.translationPriorities.get('u-race-corrected:en')).toEqual({ kind: 'final', seq: 8 })
    expect(appended.translationPriorities.get('u-race-corrected:ja')).toEqual({ kind: 'final', seq: 8 })
    expect(appended.translationPriorities.has('u-race-corrected:ko')).toBe(false)
  })

  it('preserves source bubble flags when a mixed finalized translation is queued before append', () => {
    const mixedSourceText = 'イザナと 일본어로 잘 인식되는 소니옥스야'
    const queued = applyTranslationToUtteranceStoreState({
      store: createUtteranceStoreState([]),
      utteranceId: 'u-race-mixed',
      translations: {
        ko: mixedSourceText,
        ja: 'イザナと日本語として認識されるソニオックスだよ',
        en: 'Soniox keeps recognizing Izanato as Japanese.',
      },
      priority: { kind: 'final', seq: 9 },
      markFinalized: true,
      detectedSourceLanguage: 'ko',
      sourceLanguagesMixed: true,
      selectedLanguages: ['ko', 'ja', 'en'],
      sourceText: mixedSourceText,
    })

    const appended = appendFinalizedUtteranceToStoreState(queued, {
      id: 'u-race-mixed',
      originalText: mixedSourceText,
      originalLang: 'ja',
      targetLanguages: ['ko', 'en'],
      translations: {},
      translationFinalized: {},
      createdAtMs: 1700000000004,
    })

    expect(appended.pendingTranslationUpdates.size).toBe(0)
    expect(appended.utterances).toEqual([
      {
        id: 'u-race-mixed',
        originalText: mixedSourceText,
        originalLang: 'ko',
        sourceLanguagesMixed: true,
        targetLanguages: ['ko', 'ja', 'en'],
        translations: {
          ko: mixedSourceText,
          ja: 'イザナと日本語として認識されるソニオックスだよ',
          en: 'Soniox keeps recognizing Izanato as Japanese.',
        },
        translationFinalized: {
          ko: true,
          ja: true,
          en: true,
        },
        createdAtMs: 1700000000004,
      },
    ])
  })

  it('inserts a later-arriving finalized utterance back into chronological order', () => {
    const appended = appendFinalizedUtteranceToStoreState(createUtteranceStoreState([
      {
        id: 'u-later',
        originalText: 'Later speaker',
        originalLang: 'ko',
        targetLanguages: ['en'],
        translations: {},
        translationFinalized: {},
        createdAtMs: 1700000000002,
      },
    ]), {
      id: 'u-earlier',
      originalText: 'Earlier speaker',
      originalLang: 'en',
      targetLanguages: ['ko'],
      translations: {},
      translationFinalized: {},
      createdAtMs: 1700000000001,
    })

    expect(appended.utterances.map((utterance) => utterance.id)).toEqual(['u-earlier', 'u-later'])
  })

  it('merges committed and live utterances without letting a later draft steal the earlier slot', () => {
    const merged = mergeDisplayUtterances({
      utterances: [
        {
          id: 'u-1',
          originalText: 'Earlier committed',
          originalLang: 'en',
          targetLanguages: ['ko'],
          translations: {},
          translationFinalized: {},
          createdAtMs: 1700000000001,
        },
      ],
      liveUtterances: [
        {
          id: 'u-1',
          originalText: 'Earlier draft',
          originalLang: 'en',
          targetLanguages: ['ko'],
          translations: {},
          translationFinalized: {},
          createdAtMs: 1700000000001,
        },
        {
          id: 'u-2',
          originalText: 'Later draft',
          originalLang: 'ko',
          targetLanguages: ['en'],
          translations: {},
          translationFinalized: {},
          createdAtMs: 1700000000002,
        },
      ],
    })

    expect(merged.map((utterance) => utterance.id)).toEqual(['u-1', 'u-2'])
    expect(merged[0]?.originalText).toBe('Earlier committed')
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

  it('reconciles finalized utterance source language from the final translation response', () => {
    const store = createUtteranceStoreState([
      {
        id: 'u-real',
        originalText: '안녕하세요',
        originalLang: 'ja',
        targetLanguages: ['en', 'ko'],
        translations: {
          ko: '안녕하세요',
        },
        translationFinalized: {
          ko: false,
        },
        createdAtMs: 1700000000004,
      },
    ])

    const updated = applyTranslationToUtteranceStoreState({
      store,
      utteranceId: 'u-real',
      translations: {
        ko: '안녕하세요',
        ja: 'こんにちは',
        en: 'Hello',
      },
      priority: { kind: 'final', seq: 10 },
      markFinalized: true,
      detectedSourceLanguage: 'ko',
      selectedLanguages: ['en', 'ja', 'ko'],
      sourceText: '안녕하세요',
    })

    expect(updated.utterances[0]).toEqual({
      id: 'u-real',
      originalText: '안녕하세요',
      originalLang: 'ko',
      targetLanguages: ['en', 'ja'],
      translations: {
        en: 'Hello',
        ja: 'こんにちは',
      },
      translationFinalized: {
        en: true,
        ja: true,
      },
      createdAtMs: 1700000000004,
    })
    expect(updated.translationPriorities.get('u-real:en')).toEqual({ kind: 'final', seq: 10 })
    expect(updated.translationPriorities.get('u-real:ja')).toEqual({ kind: 'final', seq: 10 })
    expect(updated.translationPriorities.has('u-real:ko')).toBe(false)
  })

  it('reconciles source language safely when a stored utterance has no targetLanguages array', () => {
    const updated = applyTranslationToUtteranceStoreState({
      store: createUtteranceStoreState([
        {
          id: 'u-legacy',
          originalText: '안녕하세요',
          originalLang: 'ja',
          translations: {},
          translationFinalized: {},
          createdAtMs: 1700000000004,
        },
      ]),
      utteranceId: 'u-legacy',
      translations: {
        ko: '안녕하세요',
        ja: 'こんにちは',
        en: 'Hello',
      },
      priority: { kind: 'final', seq: 11 },
      markFinalized: true,
      detectedSourceLanguage: 'ko',
      selectedLanguages: ['en', 'ja', 'ko'],
      sourceText: '안녕하세요',
    })

    expect(updated.utterances[0]).toEqual({
      id: 'u-legacy',
      originalText: '안녕하세요',
      originalLang: 'ko',
      targetLanguages: ['en', 'ja'],
      translations: {
        en: 'Hello',
        ja: 'こんにちは',
      },
      translationFinalized: {
        en: true,
        ja: true,
      },
      createdAtMs: 1700000000004,
    })
  })

  it('keeps the source-language bubble when the finalized utterance mixes languages', () => {
    const mixedSourceText = 'イザナと 일본어로 잘 인식되는 소니옥스야'
    const updated = applyTranslationToUtteranceStoreState({
      store: createUtteranceStoreState([{
        id: 'u-mixed',
        originalText: mixedSourceText,
        originalLang: 'ja',
        targetLanguages: ['ko', 'en'],
        translations: {
          ko: '이전 한국어 번역',
          en: 'Previous English translation',
        },
        translationFinalized: {},
        createdAtMs: 1700000000005,
      }]),
      utteranceId: 'u-mixed',
      translations: {
        ko: mixedSourceText,
        ja: 'イザナと日本語として認識されるソニオックスだよ',
        en: 'Soniox keeps recognizing Izanato as Japanese.',
      },
      priority: { kind: 'final', seq: 11 },
      markFinalized: true,
      detectedSourceLanguage: 'ko',
      sourceLanguagesMixed: true,
      selectedLanguages: ['ko', 'ja', 'en'],
      sourceText: mixedSourceText,
    })

    expect(updated.utterances[0]).toEqual({
      id: 'u-mixed',
      originalText: mixedSourceText,
      originalLang: 'ko',
      sourceLanguagesMixed: true,
      targetLanguages: ['ko', 'ja', 'en'],
      translations: {
        ko: mixedSourceText,
        ja: 'イザナと日本語として認識されるソニオックスだよ',
        en: 'Soniox keeps recognizing Izanato as Japanese.',
      },
      translationFinalized: {
        ko: true,
        ja: true,
        en: true,
      },
      createdAtMs: 1700000000005,
    })
  })

  it('keeps the source-language bubble when the finalized utterance uses foreign script for the source language', () => {
    const transliteratedJapanese = '료카이데스'
    const updated = applyTranslationToUtteranceStoreState({
      store: createUtteranceStoreState([{
        id: 'u-foreign-script',
        originalText: transliteratedJapanese,
        originalLang: 'ko',
        targetLanguages: ['ja', 'en'],
        translations: {
          ja: '了解です',
          en: 'Understood.',
        },
        translationFinalized: {},
        createdAtMs: 1700000000006,
      }]),
      utteranceId: 'u-foreign-script',
      translations: {
        ja: transliteratedJapanese,
        ko: '알겠습니다.',
        en: 'Understood.',
      },
      priority: { kind: 'final', seq: 12 },
      markFinalized: true,
      detectedSourceLanguage: 'ja',
      sourceTextHasForeignScript: true,
      selectedLanguages: ['ko', 'ja', 'en'],
      sourceText: transliteratedJapanese,
    })

    expect(updated.utterances[0]).toEqual({
      id: 'u-foreign-script',
      originalText: transliteratedJapanese,
      originalLang: 'ja',
      sourceTextHasForeignScript: true,
      targetLanguages: ['ko', 'ja', 'en'],
      translations: {
        ko: '알겠습니다.',
        ja: transliteratedJapanese,
        en: 'Understood.',
      },
      translationFinalized: {
        ko: true,
        ja: true,
        en: true,
      },
      createdAtMs: 1700000000006,
    })
  })

  it('chooses the first rendered translation bubble for finalized TTS', () => {
    expect(resolveRenderedTtsCandidateFromUtterance({
      originalLang: 'ko',
      targetLanguages: ['en', 'ja'],
      translations: {
        en: 'Hello',
        ja: 'こんにちは',
      },
      translationFinalized: {
        en: true,
        ja: true,
      },
    })).toEqual({
      language: 'en',
      text: 'Hello',
    })

    expect(resolveRenderedTtsCandidateFromUtterance({
      originalLang: 'en',
      targetLanguages: ['ja', 'ko'],
      translations: {
        ja: 'こんにちは',
        ko: '안녕하세요',
      },
      translationFinalized: {
        ja: true,
        ko: true,
      },
    })).toEqual({
      language: 'ja',
      text: 'こんにちは',
    })
  })

  it('allows the mixed source-language bubble to become the first rendered TTS candidate', () => {
    expect(resolveRenderedTtsCandidateFromUtterance({
      originalLang: 'ko',
      sourceLanguagesMixed: true,
      targetLanguages: ['ko', 'ja', 'en'],
      translations: {
        ko: 'イザナと 일본어로 잘 인식되는 소니옥스야',
        ja: 'イザナと日本語として認識されるソニオックスだよ',
        en: 'Soniox keeps recognizing Izanato as Japanese.',
      },
      translationFinalized: {
        ko: true,
        ja: true,
        en: true,
      },
    })).toEqual({
      language: 'ko',
      text: 'イザナと 일본어로 잘 인식되는 소니옥스야',
    })
  })

  it('allows the foreign-script source-language bubble to become the first rendered TTS candidate', () => {
    expect(resolveRenderedTtsCandidateFromUtterance({
      originalLang: 'ja',
      sourceTextHasForeignScript: true,
      targetLanguages: ['ko', 'ja', 'en'],
      translations: {
        ko: '알겠습니다.',
        ja: '료카이데스',
        en: 'Understood.',
      },
      translationFinalized: {
        ko: true,
        ja: true,
        en: true,
      },
    })).toEqual({
      language: 'ko',
      text: '알겠습니다.',
    })
  })

  it('returns no rendered TTS candidate when no translation bubble is visible', () => {
    expect(resolveRenderedTtsCandidateFromUtterance({
      originalLang: 'ko',
      targetLanguages: [],
      translations: {},
      translationFinalized: {},
    })).toBeNull()

    expect(resolveRenderedTtsCandidateFromUtterance({
      originalLang: 'ko',
      targetLanguages: ['en'],
      translations: {
        ko: '안녕하세요',
      },
      translationFinalized: {
        en: true,
      },
    })).toBeNull()
  })

  it('builds stable translate request signatures for duplicate-request dedupe', () => {
    expect(buildLiveTranslateRequestSignature({
      utteranceId: 12,
      speaker: 'speaker-1',
      language: 'en',
      targetLanguages: ['ko', 'ja'],
      text: 'Hello world',
    })).toBe('12::speaker-1::en::ko\u001fja::Hello world')

    expect(buildLiveTranslateRequestSignature({
      utteranceId: 12,
      speaker: '',
      language: 'en',
      targetLanguages: ['ko'],
      text: '  Hello world  ',
    })).toBe('12::unknown::en::ko::Hello world')
  })

  it('changes translate request signatures when target languages change mid-turn', () => {
    expect(buildLiveTranslateRequestSignature({
      utteranceId: 12,
      speaker: 'speaker-1',
      language: 'en',
      targetLanguages: ['ko', 'ja'],
      text: 'Hello world',
    })).not.toBe(buildLiveTranslateRequestSignature({
      utteranceId: 12,
      speaker: 'speaker-1',
      language: 'en',
      targetLanguages: ['ko'],
      text: 'Hello world',
    }))
  })

  it('defaults partial translate mode to time and parses env overrides', () => {
    expect(parsePartialTranslateMode(undefined)).toBe('time')
    expect(parsePartialTranslateMode('char')).toBe('char')
    expect(parsePartialTranslateMode('both')).toBe('both')
    expect(parsePartialTranslateMode('weird')).toBe('time')
    expect(parsePositiveIntWithFallback(undefined, 2000)).toBe(2000)
    expect(parsePositiveIntWithFallback('2500', 2000)).toBe(2500)
    expect(parsePositiveIntWithFallback('0', 2000)).toBe(2000)
  })

  it('fires partial translation immediately on the first pending text', () => {
    expect(shouldTriggerPartialTranslate({
      mode: 'time',
      isInitialRequest: true,
      targetLanguagesChanged: false,
      textLength: 8,
      currentText: '안녕하세요',
      lastRequestedText: '',
      lastTranslateLen: 0,
      charStep: 20,
      elapsedSinceLastRequestMs: 0,
      intervalMs: 2000,
    })).toEqual({
      shouldRequest: true,
      nextLastTranslateLen: 0,
    })
  })

  it('fires time-based partial translation only after the interval when text changed', () => {
    expect(shouldTriggerPartialTranslate({
      mode: 'time',
      isInitialRequest: false,
      targetLanguagesChanged: false,
      textLength: 16,
      currentText: 'hello there world',
      lastRequestedText: 'hello there',
      lastTranslateLen: 0,
      charStep: 20,
      elapsedSinceLastRequestMs: 1900,
      intervalMs: 2000,
    }).shouldRequest).toBe(false)

    expect(shouldTriggerPartialTranslate({
      mode: 'time',
      isInitialRequest: false,
      targetLanguagesChanged: false,
      textLength: 16,
      currentText: 'hello there world',
      lastRequestedText: 'hello there',
      lastTranslateLen: 0,
      charStep: 20,
      elapsedSinceLastRequestMs: 2000,
      intervalMs: 2000,
    }).shouldRequest).toBe(true)
  })

  it('can still use char threshold mode when enabled', () => {
    expect(shouldTriggerPartialTranslate({
      mode: 'char',
      isInitialRequest: false,
      targetLanguagesChanged: false,
      textLength: 39,
      currentText: '123456789012345678901234567890123456789',
      lastRequestedText: '12345678901234567890',
      lastTranslateLen: 20,
      charStep: 20,
      elapsedSinceLastRequestMs: 500,
      intervalMs: 2000,
    })).toEqual({
      shouldRequest: false,
      nextLastTranslateLen: 20,
    })

    expect(shouldTriggerPartialTranslate({
      mode: 'char',
      isInitialRequest: false,
      targetLanguagesChanged: false,
      textLength: 40,
      currentText: '1234567890123456789012345678901234567890',
      lastRequestedText: '12345678901234567890',
      lastTranslateLen: 20,
      charStep: 20,
      elapsedSinceLastRequestMs: 500,
      intervalMs: 2000,
    })).toEqual({
      shouldRequest: true,
      nextLastTranslateLen: 40,
    })
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

  it('classifies recent finalized utterance matches for local handoff and server duplicates', () => {
    expect(classifyRecentFinalizedUtteranceMatch({
      pendingUtteranceId: null,
      finalizedUtteranceId: 'u-server',
      recentFinalizedUtterance: {
        id: 'u-local',
        text: '짧게',
        language: 'ko',
        expiresAt: 5_000,
        source: 'local',
      },
      nowMs: 1_000,
      text: '짧게.',
      language: 'ko',
    })).toEqual({
      kind: 'reuse_local',
      utteranceId: 'u-local',
    })

    expect(classifyRecentFinalizedUtteranceMatch({
      pendingUtteranceId: 'u-pending',
      finalizedUtteranceId: 'u-pending',
      recentFinalizedUtterance: {
        id: 'u-local',
        text: '짧게.',
        language: 'ko',
        expiresAt: 5_000,
        source: 'local',
      },
      nowMs: 1_000,
      text: '짧게.',
      language: 'ko',
    })).toEqual({ kind: 'none' })

    expect(classifyRecentFinalizedUtteranceMatch({
      pendingUtteranceId: null,
      finalizedUtteranceId: 'u-server',
      recentFinalizedUtterance: {
        id: 'u-server-prev',
        text: '짧게.',
        language: 'ko',
        expiresAt: 5_000,
        source: 'server',
      },
      nowMs: 1_000,
      text: '짧게.',
      language: 'ko',
    })).toEqual({
      kind: 'skip_duplicate_server',
      utteranceId: 'u-server-prev',
    })
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

  it('accepts partial translation responses for the matching pending utterance only', () => {
    expect(shouldApplyPendingTurnPartialTranslationResponse({
      requestUtteranceId: 'u-9',
      currentPendingUtteranceId: 'u-9',
      requestSeq: 3,
      latestRequestSeq: 3,
      aborted: false,
    })).toBe(true)

    expect(shouldApplyPendingTurnPartialTranslationResponse({
      requestUtteranceId: 'u-9',
      currentPendingUtteranceId: 'u-10',
      requestSeq: 3,
      latestRequestSeq: 3,
      aborted: false,
    })).toBe(false)

    expect(shouldApplyPendingTurnPartialTranslationResponse({
      requestUtteranceId: 'u-9',
      currentPendingUtteranceId: 'u-9',
      requestSeq: 2,
      latestRequestSeq: 3,
      aborted: false,
    })).toBe(false)

    expect(shouldApplyPendingTurnPartialTranslationResponse({
      requestUtteranceId: 'u-9',
      currentPendingUtteranceId: 'u-9',
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

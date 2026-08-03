import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildLanguageSelectionSignature,
  buildSonioxLanguageHints,
  buildSonioxNativeTranslationConfig,
  appendFinalizedUtteranceToStoreState,
  buildLiveUtterance,
  buildLiveUtterances,
  applyTranslationToUtteranceStoreState,
  buildLiveTranslateRequestSignature,
  buildFinalizedUtterancePayload,
  buildPersistedUtteranceCache,
  countPersistedUtterances,
  classifyRecentFinalizedUtteranceMatch,
  createUtteranceStoreState,
  findRecentMatchingUtteranceIndex,
  getWsUrl,
  isDuplicateTimedSignature,
  filterTranslationsToTargetLanguages,
  getOrCreateTrackingUserId,
  mergeDisplayUtterances,
  mergeServerHydrationUtteranceIntoStoreState,
  LOCAL_UTTERANCE_CACHE_LIMIT,
  resolveRenderedTtsCandidateFromUtterance,
  parseSttTranscriptMessage,
  parseSttTranslationMessage,
  parsePartialTranslateMode,
  parsePositiveIntWithFallback,
  parseRecentStoredUtterances,
  persistMessageCountSnapshot,
  persistUtterancesSnapshot,
  normalizeSonioxNativeTranslations,
  pruneUnresolvedTranslationTargets,
  rememberRecentFinalizedUtterance,
  replaceFinalizedUtteranceSourceInStoreState,
  resolveCachedNativeMicPermissionRecoveryAction,
  resolveNativeMicPermissionRecoveryAction,
  resolveConnectionStatusFromNativeBridgeStatus,
  shouldApplyNativeBridgeConnectionStatus,
  shouldResetConnectionToIdleForNativeMicRecovery,
  shouldPromoteConnectionStatusFromNativeActivity,
  shouldHandleNativeBridgeServerMessage,
  shouldTrackUsageForConnectionStatus,
  shouldApplyPendingTurnPartialTranslationResponse,
  shouldOpenNativeMicSettingsOnRetry,
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
  const originalWsPath = process.env.NEXT_PUBLIC_WS_PATH

  afterEach(() => {
    if (originalWsUrl === undefined) {
      delete process.env.NEXT_PUBLIC_WS_URL
    } else {
      process.env.NEXT_PUBLIC_WS_URL = originalWsUrl
    }
    if (originalWsPath === undefined) {
      delete process.env.NEXT_PUBLIC_WS_PATH
    } else {
      process.env.NEXT_PUBLIC_WS_PATH = originalWsPath
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
    delete process.env.NEXT_PUBLIC_WS_PATH

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

  it('parses only recent stored utterances without full-history parsing', () => {
    const raw = JSON.stringify(Array.from({ length: 4 }, (_, index) => ({
      id: `u-${index}`,
      originalText: index === 3 ? "He said \"screw it, let's do it\" and kept going." : `message ${index}`,
      originalLang: 'en',
      targetLanguages: ['ko'],
      translations: { ko: `메시지 ${index}` },
      translationFinalized: { ko: true },
      createdAtMs: 1700000000000 + index,
    })))

    expect(parseRecentStoredUtterances(raw, 2)).toEqual({
      utterances: [
        expect.objectContaining({ id: 'u-2', originalText: 'message 2' }),
        expect.objectContaining({ id: 'u-3', originalText: "He said \"screw it, let's do it\" and kept going." }),
      ],
      hasOlder: true,
    })
    expect(parseRecentStoredUtterances('[]', 2)).toEqual({ utterances: [], hasOlder: false })
  })

  it('uses same-origin websocket path when NEXT_PUBLIC_WS_PATH is set', () => {
    delete process.env.NEXT_PUBLIC_WS_URL
    process.env.NEXT_PUBLIC_WS_PATH = '/stt'

    vi.stubGlobal('window', {
      location: {
        hostname: 'mingle-1-1-4-production.up.railway.app',
        port: '',
        protocol: 'https:',
      },
    })
    expect(getWsUrl()).toBe('wss://mingle-1-1-4-production.up.railway.app/stt')

    vi.stubGlobal('window', {
      location: {
        hostname: 'localhost',
        port: '8080',
        protocol: 'http:',
      },
    })
    expect(getWsUrl()).toBe('ws://localhost:8080/stt')
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

  it('removes persisted utterances from localStorage when the next snapshot is empty', () => {
    const localStorage = createLocalStorageMock({
      mingle_demo_utterances: '[{"id":"old"}]',
      mingle_demo_usage_sec: '42',
    })
    vi.stubGlobal('window', { localStorage })

    persistUtterancesSnapshot([])

    expect(localStorage.getItem('mingle_demo_utterances')).toBeNull()
    expect(localStorage.getItem('mingle_demo_usage_sec')).toBe('42')
  })

  it('persists utterances to localStorage when the snapshot is not empty', () => {
    const localStorage = createLocalStorageMock()
    vi.stubGlobal('window', { localStorage })

    persistUtterancesSnapshot([
      {
        id: 'u-1-1',
        originalText: 'hello',
        originalLang: 'en',
        targetLanguages: ['ko'],
        translations: {
          ko: '안녕하세요',
        },
      },
    ])

    expect(localStorage.getItem('mingle_demo_utterances')).toBe(JSON.stringify([
      {
        id: 'u-1-1',
        originalText: 'hello',
        originalLang: 'en',
        targetLanguages: ['ko'],
        translations: {
          ko: '안녕하세요',
        },
      },
    ]))
  })

  it('persists utterance snapshots under a storage namespace when provided', () => {
    const localStorage = createLocalStorageMock({
      mingle_demo_utterances: '[{"id":"legacy"}]',
      mingle_demo_utterances__conv_1: '[{"id":"old"}]',
    })
    vi.stubGlobal('window', { localStorage })

    persistUtterancesSnapshot([
      {
        id: 'u-2-1',
        originalText: 'bonjour',
        originalLang: 'fr',
        targetLanguages: ['en'],
        translations: {
          en: 'hello',
        },
      },
    ], 'conv_1')

    expect(localStorage.getItem('mingle_demo_utterances')).toBe('[{"id":"legacy"}]')
    expect(localStorage.getItem('mingle_demo_utterances__conv_1')).toBe(JSON.stringify([
      {
        id: 'u-2-1',
        originalText: 'bonjour',
        originalLang: 'fr',
        targetLanguages: ['en'],
        translations: {
          en: 'hello',
        },
      },
    ]))

    persistUtterancesSnapshot([], 'conv_1')
    expect(localStorage.getItem('mingle_demo_utterances')).toBe('[{"id":"legacy"}]')
    expect(localStorage.getItem('mingle_demo_utterances__conv_1')).toBeNull()
  })

  it('trims persisted conversation-room utterances to the latest cache window', () => {
    const localStorage = createLocalStorageMock()
    vi.stubGlobal('window', { localStorage })
    const utterances = Array.from({ length: LOCAL_UTTERANCE_CACHE_LIMIT + 1 }, (_, index) => ({
      id: `u-${index}`,
      originalText: `text ${index}`,
      originalLang: 'en',
      targetLanguages: [],
      translations: {},
      createdAtMs: index,
    }))

    persistUtterancesSnapshot(utterances, 'conv_room_1', {
      maxItems: LOCAL_UTTERANCE_CACHE_LIMIT,
    })

    const persisted = JSON.parse(localStorage.getItem('mingle_demo_utterances__conv_room_1') || '[]')
    expect(persisted).toHaveLength(LOCAL_UTTERANCE_CACHE_LIMIT)
    expect(persisted[0].id).toBe('u-1')
    expect(persisted.at(-1).id).toBe(`u-${LOCAL_UTTERANCE_CACHE_LIMIT}`)
  })

  it('keeps the full persisted utterance snapshot when no cache limit is provided', () => {
    const utterances = [
      { id: 'u-1', originalText: 'one', originalLang: 'en', targetLanguages: [], translations: {} },
      { id: 'u-2', originalText: 'two', originalLang: 'en', targetLanguages: [], translations: {} },
    ]

    expect(buildPersistedUtteranceCache(utterances)).toBe(utterances)
  })

  it('persists message count separately from utterance cache snapshots', () => {
    const localStorage = createLocalStorageMock({
      mingle_demo_utterances__conv_room_1: JSON.stringify([{ id: 'u-1', originalText: 'one' }]),
    })
    vi.stubGlobal('window', { localStorage })

    persistMessageCountSnapshot(250, 'conv_room_1')

    expect(localStorage.getItem('mingle_demo_message_count__conv_room_1')).toBe('250')
    expect(localStorage.getItem('mingle_demo_utterances__conv_room_1')).toBe(JSON.stringify([
      { id: 'u-1', originalText: 'one' },
    ]))
  })

  it('counts persisted utterances by unique non-empty message id for legacy stat fallback', () => {
    expect(countPersistedUtterances([
      { id: 'u-1', originalText: 'one', originalLang: 'en', targetLanguages: [], translations: {} },
      { id: 'u-1', originalText: 'duplicate', originalLang: 'en', targetLanguages: [], translations: {} },
      { id: 'u-2', originalText: '   ', originalLang: 'en', targetLanguages: [], translations: {} },
      { id: 'u-3', originalText: 'three', originalLang: 'en', targetLanguages: [], translations: {} },
    ])).toBe(2)
  })

  it('replaces stale cached utterance fields with server hydration values', () => {
    const store = createUtteranceStoreState([
      {
        id: 'u-local-only',
        originalText: 'local only',
        originalLang: 'en',
        targetLanguages: [],
        translations: {},
        createdAtMs: 1,
      },
      {
        id: 'u-server',
        originalText: 'stale source',
        originalLang: 'en',
        targetLanguages: ['ko'],
        translations: { ko: 'stale translation' },
        translationFinalized: { ko: true },
        createdAtMs: 2,
      },
    ])

    const merged = mergeServerHydrationUtteranceIntoStoreState(store, {
      id: 'u-server',
      originalText: 'server source',
      originalLang: 'en',
      targetLanguages: ['ko'],
      translations: { ko: 'server translation' },
      translationFinalized: { ko: true },
      createdAtMs: 2,
    })

    expect(merged.utterances).toEqual([
      {
        id: 'u-local-only',
        originalText: 'local only',
        originalLang: 'en',
        targetLanguages: [],
        translations: {},
        createdAtMs: 1,
      },
      {
        id: 'u-server',
        originalText: 'server source',
        originalLang: 'en',
        targetLanguages: ['ko'],
        translations: { ko: 'server translation' },
        translationFinalized: { ko: true },
        createdAtMs: 2,
      },
    ])
  })

  it('applies pending translation updates on top of a server hydrated utterance', () => {
    const storeWithPending = applyTranslationToUtteranceStoreState({
      store: createUtteranceStoreState([]),
      utteranceId: 'u-server',
      translations: { ko: 'pending translation' },
      priority: { kind: 'final', seq: 1 },
      markFinalized: true,
    })

    const merged = mergeServerHydrationUtteranceIntoStoreState(storeWithPending, {
      id: 'u-server',
      originalText: 'server source',
      originalLang: 'en',
      targetLanguages: ['ko'],
      translations: { ko: 'server translation' },
      translationFinalized: { ko: true },
      createdAtMs: 1,
    })

    expect(merged.utterances).toEqual([
      {
        id: 'u-server',
        originalText: 'server source',
        originalLang: 'en',
        targetLanguages: ['ko'],
        translations: { ko: 'pending translation' },
        translationFinalized: { ko: true },
        createdAtMs: 1,
      },
    ])
    expect(merged.pendingTranslationUpdates.size).toBe(0)
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

  it('uses Soniox native translation only for matching two-language sessions', () => {
    expect(buildSonioxNativeTranslationConfig(['ko', 'en'], ['en', 'ko'])).toEqual({
      type: 'two_way',
      language_a: 'ko',
      language_b: 'en',
    })
    expect(buildSonioxNativeTranslationConfig(['ko', 'en'], ['en', 'ko', 'ja'])).toBeNull()
    expect(buildSonioxNativeTranslationConfig(['ko', 'en', 'ja'], ['ko', 'en', 'ja'])).toBeNull()
  })

  it('maps Soniox translation codes back to selected client language codes', () => {
    expect(normalizeSonioxNativeTranslations({ zh: '你好', en: 'hello' }, ['zh-CN', 'en'])).toEqual({
      'zh-CN': '你好',
      en: 'hello',
    })
  })

  it('parses Soniox partial translation messages', () => {
    expect(parseSttTranslationMessage({
      type: 'translation',
      data: {
        speaker: 'speaker-2',
        target_language: 'ko',
        translated_utterance: { text: ' 안녕하세요 ' },
        is_partial: true,
      },
    })).toEqual({
      speaker: 'speaker-2',
      targetLanguage: 'ko',
      text: '안녕하세요',
    })
  })

  it('preserves STT finalize source metadata when present', () => {
    const parsed = parseSttTranscriptMessage({
      type: 'transcript',
      data: {
        is_final: true,
        finalize_source: 'server_idle_snapshot',
        utterance: {
          text: 'Hello there',
          language: 'en-US',
          speaker: 'speaker-2',
        },
      },
    })

    expect(parsed?.finalizeSource).toBe('server_idle_snapshot')
  })

  it('promotes generic Chinese transcript language to zh-CN by default', () => {
    const parsed = parseSttTranscriptMessage({
      type: 'transcript',
      data: {
        is_final: true,
        utterance: {
          text: '这是简体中文',
          language: 'zh',
          speaker: 'speaker-1',
        },
      },
    })

    expect(parsed?.language).toBe('zh-CN')
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

  it('treats generic Chinese source as zh-CN so zh-CN target bubbles do not duplicate', () => {
    const built = buildFinalizedUtterancePayload({
      speaker: 'speaker-2',
      rawText: '这是简体中文',
      rawLanguage: 'zh',
      languages: ['zh-CN', 'zh-TW', 'en'],
      partialTranslations: {
        'zh-CN': '不应保留',
        'zh-TW': '這是繁體中文',
        en: 'This is simplified Chinese',
      },
      utteranceSerial: 8,
      nowMs: 1700000000001,
    })

    expect(built?.language).toBe('zh-CN')
    expect(built?.utterance.originalLang).toBe('zh-CN')
    expect(built?.utterance.targetLanguages).toEqual(['zh-TW', 'en'])
    expect(built?.utterance.translations).toEqual({
      'zh-TW': '這是繁體中文',
      en: 'This is simplified Chinese',
    })
  })

  it('preserves explicit Traditional Chinese source language for target filtering', () => {
    const built = buildFinalizedUtterancePayload({
      speaker: 'speaker-2',
      rawText: '這是繁體中文',
      rawLanguage: 'zh-TW',
      languages: ['zh-CN', 'zh-TW', 'en'],
      partialTranslations: {
        'zh-CN': '这是简体中文',
        'zh-TW': '不应保留',
        en: 'This is traditional Chinese',
      },
      utteranceSerial: 9,
      nowMs: 1700000000002,
    })

    expect(built?.language).toBe('zh-TW')
    expect(built?.utterance.originalLang).toBe('zh-TW')
    expect(built?.utterance.targetLanguages).toEqual(['zh-CN', 'en'])
    expect(built?.utterance.translations).toEqual({
      'zh-CN': '这是简体中文',
      en: 'This is traditional Chinese',
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
    expect(buildSonioxLanguageHints([' en ', '', 'ko', 'EN', 'zh-CN', 'zh-TW', 'ja ']))
      .toEqual(['en', 'ko', 'zh', 'ja'])
  })

  it('keeps Chinese translation variants distinct in target-language filtering', () => {
    expect(filterTranslationsToTargetLanguages({
      'zh-CN': '简体中文',
      'zh-TW': '繁體中文',
      en: 'English',
    }, ['zh-CN', 'zh-TW'])).toEqual({
      'zh-CN': '简体中文',
      'zh-TW': '繁體中文',
    })
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

  it('keeps cached Android microphone denials on the in-app retry path', () => {
    expect(resolveCachedNativeMicPermissionRecoveryAction({
      apiNamespace: 'android/v1.1.0',
      permission: 'denied',
    })).toBe('none')

    expect(resolveCachedNativeMicPermissionRecoveryAction({
      apiNamespace: 'ios/v1.1.0',
      permission: 'denied',
    })).toBe('open_ios_settings')
  })

  it('opens native mic settings only after iOS denial recovery returns to idle', () => {
    expect(shouldOpenNativeMicSettingsOnRetry({
      useNativeStt: true,
      connectionStatus: 'idle',
      recoveryAction: 'open_ios_settings',
      supportsNativeOpenAppSettingsCommand: true,
    })).toBe(true)

    expect(shouldOpenNativeMicSettingsOnRetry({
      useNativeStt: true,
      connectionStatus: 'idle',
      recoveryAction: 'open_ios_settings',
      supportsNativeOpenAppSettingsCommand: false,
    })).toBe(true)

    expect(shouldOpenNativeMicSettingsOnRetry({
      useNativeStt: true,
      connectionStatus: 'connecting',
      recoveryAction: 'open_ios_settings',
      supportsNativeOpenAppSettingsCommand: true,
    })).toBe(false)

    expect(shouldOpenNativeMicSettingsOnRetry({
      useNativeStt: true,
      connectionStatus: 'error',
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
      recoveryAction: 'none',
      supportsNativeOpenAppSettingsCommand: false,
    })).toBe(false)
  })

  it('returns denied iOS native mic recovery to idle instead of sticky error', () => {
    expect(shouldResetConnectionToIdleForNativeMicRecovery({
      platform: 'ios',
      code: 'mic_permission',
      message: 'Microphone permission denied',
    })).toBe(true)

    expect(shouldResetConnectionToIdleForNativeMicRecovery({
      platform: 'ios',
      message: 'mic_permission_denied_after_prompt',
    })).toBe(true)

    expect(shouldResetConnectionToIdleForNativeMicRecovery({
      platform: 'android',
      code: 'mic_permission',
      message: 'Microphone permission denied',
    })).toBe(false)
  })

  it('maps native bridge statuses back into UI connection state for restore flows', () => {
    expect(resolveConnectionStatusFromNativeBridgeStatus({
      nativeStatus: 'running',
      previousConnectionStatus: 'idle',
    })).toBe('connecting')

    expect(resolveConnectionStatusFromNativeBridgeStatus({
      nativeStatus: 'silenced',
      previousConnectionStatus: 'idle',
    })).toBe('connecting')

    expect(resolveConnectionStatusFromNativeBridgeStatus({
      nativeStatus: 'running',
      previousConnectionStatus: 'ready',
    })).toBe('ready')

    expect(resolveConnectionStatusFromNativeBridgeStatus({
      nativeStatus: 'silenced',
      previousConnectionStatus: 'ready',
    })).toBe('ready')

    expect(resolveConnectionStatusFromNativeBridgeStatus({
      nativeStatus: 'starting',
      previousConnectionStatus: 'idle',
    })).toBe('connecting')

    expect(resolveConnectionStatusFromNativeBridgeStatus({
      nativeStatus: 'recovering',
      previousConnectionStatus: 'ready',
    })).toBe('connecting')

    expect(resolveConnectionStatusFromNativeBridgeStatus({
      nativeStatus: 'stopped',
      previousConnectionStatus: 'ready',
    })).toBe('idle')

    expect(resolveConnectionStatusFromNativeBridgeStatus({
      nativeStatus: 'failed',
      previousConnectionStatus: 'connecting',
    })).toBe('error')
  })

  it('ignores missing or unknown native bridge statuses for older native shells', () => {
    expect(resolveConnectionStatusFromNativeBridgeStatus({
      nativeStatus: undefined,
      previousConnectionStatus: 'idle',
    })).toBeNull()

    expect(resolveConnectionStatusFromNativeBridgeStatus({
      nativeStatus: '',
      previousConnectionStatus: 'ready',
    })).toBeNull()

    expect(resolveConnectionStatusFromNativeBridgeStatus({
      nativeStatus: 'legacy_unknown_state',
      previousConnectionStatus: 'connecting',
    })).toBeNull()
  })

  it('does not re-enter running UI state while a native stop is pending', () => {
    expect(shouldApplyNativeBridgeConnectionStatus({
      nextConnectionStatus: resolveConnectionStatusFromNativeBridgeStatus({
        nativeStatus: 'running',
        previousConnectionStatus: 'idle',
      }),
      nativeStopRequested: true,
    })).toBe(false)

    expect(shouldApplyNativeBridgeConnectionStatus({
      nextConnectionStatus: resolveConnectionStatusFromNativeBridgeStatus({
        nativeStatus: 'ready',
        previousConnectionStatus: 'idle',
      }),
      isStopping: true,
    })).toBe(false)

    expect(shouldApplyNativeBridgeConnectionStatus({
      nextConnectionStatus: resolveConnectionStatusFromNativeBridgeStatus({
        nativeStatus: 'stopped',
        previousConnectionStatus: 'ready',
      }),
      nativeStopRequested: true,
    })).toBe(true)

    expect(shouldHandleNativeBridgeServerMessage({
      message: { status: 'ready' },
      nativeStopRequested: true,
    })).toBe(false)

    expect(shouldHandleNativeBridgeServerMessage({
      message: { type: 'stop_recording_ack' },
      nativeStopRequested: true,
    })).toBe(true)

    expect(shouldHandleNativeBridgeServerMessage({
      message: { status: 'ready' },
      nativeStopRequested: false,
    })).toBe(true)
  })

  it('promotes native transcript activity back into ready state after unexpected web reloads', () => {
    expect(shouldPromoteConnectionStatusFromNativeActivity({
      previousConnectionStatus: 'idle',
    })).toBe(true)

    expect(shouldPromoteConnectionStatusFromNativeActivity({
      previousConnectionStatus: 'connecting',
    })).toBe(true)

    expect(shouldPromoteConnectionStatusFromNativeActivity({
      previousConnectionStatus: 'error',
    })).toBe(true)

    expect(shouldPromoteConnectionStatusFromNativeActivity({
      previousConnectionStatus: 'ready',
    })).toBe(false)

    expect(shouldPromoteConnectionStatusFromNativeActivity({
      previousConnectionStatus: 'idle',
      nativeStopRequested: true,
    })).toBe(false)

    expect(shouldPromoteConnectionStatusFromNativeActivity({
      previousConnectionStatus: 'connecting',
      isStopping: true,
    })).toBe(false)
  })

  it('tracks usage for any STT session state that resolves to ready', () => {
    expect(shouldTrackUsageForConnectionStatus('ready')).toBe(true)
    expect(shouldTrackUsageForConnectionStatus('connecting')).toBe(false)
    expect(shouldTrackUsageForConnectionStatus('idle')).toBe(false)
    expect(shouldTrackUsageForConnectionStatus('error')).toBe(false)
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

  it('marks live translations as interim before finalization', () => {
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
      translationFinalized: {
        ko: false,
      },
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
        translationFinalized: {
          ko: false,
        },
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
        translationFinalized: {
          en: false,
        },
        createdAtMs: 1700000000002,
      },
    ])
  })

  it('lets one speaker finalize without stealing the other speaker live slot', () => {
    const finalized = buildFinalizedUtterancePayload({
      speaker: 'speaker-1',
      rawText: ' First speaker finalized ',
      rawLanguage: 'en',
      languages: ['en', 'ko'],
      partialTranslations: {
        ko: '첫 번째 화자 확정',
      },
      utteranceSerial: 11,
      nowMs: 1700000000011,
    })

    expect(finalized).not.toBeNull()
    if (!finalized) {
      return
    }

    const store = appendFinalizedUtteranceToStoreState(
      createUtteranceStoreState([]),
      finalized.utterance,
      {
        translations: finalized.currentTurnPreviousState?.translations ?? {},
        priorities: new Map([
          ['ko', { kind: 'final', seq: 1 }],
        ]),
      },
    )

    const liveUtterances = buildLiveUtterances({
      pendingTurns: [
        {
          utteranceId: 'u-live-speaker-2',
          createdAtMs: 1700000000012,
          speaker: 'speaker-2',
          speakerAvatarSeed: 'avatar_seed_2',
          speakerAvatarIndex: 2,
          language: 'ko',
          text: '두 번째 화자는 아직 말하는 중',
          partialTranslations: {
            en: 'Second speaker is still talking',
          },
        },
      ],
      languages: ['en', 'ko'],
    })

    const merged = mergeDisplayUtterances({
      utterances: store.utterances,
      liveUtterances,
    })

    expect(merged.map((utterance) => utterance.id)).toEqual([
      finalized.utteranceId,
      'u-live-speaker-2',
    ])
    expect(merged[0]?.originalText).toBe('First speaker finalized')
    expect(merged[1]?.speaker).toBe('speaker-2')
    expect(merged[1]?.translations).toEqual({
      en: 'Second speaker is still talking',
    })
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

    expect(classifyRecentFinalizedUtteranceMatch({
      pendingUtteranceId: null,
      finalizedUtteranceId: 'u-server-expanded',
      recentFinalizedUtterance: {
        id: 'u-local',
        text: "Actually ready right now, so let's th",
        language: 'en',
        expiresAt: 5_000,
        source: 'local',
      },
      nowMs: 1_000,
      text: "Actually ready right now, so let's throw it on over.",
      language: 'en',
    })).toEqual({
      kind: 'reuse_local',
      utteranceId: 'u-local',
    })

    expect(classifyRecentFinalizedUtteranceMatch({
      pendingUtteranceId: null,
      finalizedUtteranceId: 'u-server-expanded',
      recentFinalizedUtterance: {
        id: 'u-server-prev',
        text: 'Actually ready',
        language: 'en',
        expiresAt: 5_000,
        source: 'server',
      },
      nowMs: 1_000,
      text: 'Actually ready now',
      language: 'en',
    })).toEqual({ kind: 'none' })
  })

  it('matches stop-time local finals independently by speaker', () => {
    const recent = [
      {
        id: 'u-local-speaker-1',
        text: 'Actually ready right now, so lets th',
        language: 'en',
        speaker: '1',
        expiresAt: 5_000,
        source: 'local' as const,
      },
      {
        id: 'u-local-speaker-2',
        text: '준비됐어',
        language: 'ko',
        speaker: '2',
        expiresAt: 5_000,
        source: 'local' as const,
      },
    ]

    expect(classifyRecentFinalizedUtteranceMatch({
      pendingUtteranceId: null,
      finalizedUtteranceId: 'u-server-speaker-1',
      recentFinalizedUtterances: recent,
      nowMs: 1_000,
      text: 'Actually ready right now, so lets throw it on over.',
      language: 'en',
      speaker: '1',
    })).toEqual({
      kind: 'reuse_local',
      utteranceId: 'u-local-speaker-1',
    })

    expect(classifyRecentFinalizedUtteranceMatch({
      pendingUtteranceId: null,
      finalizedUtteranceId: 'u-server-speaker-2',
      recentFinalizedUtterances: recent,
      nowMs: 1_000,
      text: '준비됐어.',
      language: 'ko',
      speaker: '2',
    })).toEqual({
      kind: 'reuse_local',
      utteranceId: 'u-local-speaker-2',
    })

    expect(classifyRecentFinalizedUtteranceMatch({
      pendingUtteranceId: null,
      finalizedUtteranceId: 'u-server-speaker-3',
      recentFinalizedUtterances: recent,
      nowMs: 1_000,
      text: '준비됐어.',
      language: 'ko',
      speaker: '3',
    })).toEqual({ kind: 'none' })
  })

  it('keeps multiple recent finalized utterances while pruning expired entries', () => {
    const nextRecent = rememberRecentFinalizedUtterance({
      recentFinalizedUtterances: [
        {
          id: 'u-expired',
          text: 'old',
          language: 'en',
          speaker: '1',
          expiresAt: 900,
          source: 'local',
        },
        {
          id: 'u-live',
          text: 'still recent',
          language: 'en',
          speaker: '2',
          expiresAt: 5_000,
          source: 'local',
        },
      ],
      utterance: {
        id: 'u-next',
        text: 'next',
        language: 'en',
        speaker: '3',
        expiresAt: 6_000,
        source: 'server',
      },
      nowMs: 1_000,
    })

    expect(nextRecent.map((utterance) => utterance.id)).toEqual(['u-live', 'u-next'])
  })

  it('updates a reused local final with the later server final source text', () => {
    const store = createUtteranceStoreState([
      {
        id: 'u-local',
        speaker: '1',
        originalText: "Actually ready right now, so let's th",
        originalLang: 'en',
        targetLanguages: ['ko'],
        translations: {
          ko: '아직 부분 번역',
        },
        translationFinalized: {
          ko: false,
        },
        createdAtMs: 1_700_000_000_000,
      },
    ])

    const nextStore = replaceFinalizedUtteranceSourceInStoreState({
      store,
      utteranceId: 'u-local',
      sourceText: "Actually ready right now, so let's throw it on over.",
      sourceLanguage: 'en',
      selectedLanguages: ['en', 'ko', 'ja'],
    })

    expect(nextStore.utterances).toHaveLength(1)
    expect(nextStore.utterances[0]?.originalText).toBe("Actually ready right now, so let's throw it on over.")
    expect(nextStore.utterances[0]?.originalLang).toBe('en')
    expect(nextStore.utterances[0]?.targetLanguages).toEqual(['ko', 'ja'])
    expect(nextStore.utterances[0]?.translations).toEqual({
      ko: '아직 부분 번역',
    })
  })

  it('keeps Chinese variants distinct when classifying recent finalized matches', () => {
    expect(classifyRecentFinalizedUtteranceMatch({
      pendingUtteranceId: null,
      finalizedUtteranceId: 'u-server',
      recentFinalizedUtterance: {
        id: 'u-server-prev',
        text: '你好',
        language: 'zh-TW',
        expiresAt: 5_000,
        source: 'server',
      },
      nowMs: 1_000,
      text: '你好',
      language: 'zh-CN',
    })).toEqual({ kind: 'none' })
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

  it('keeps Chinese variants distinct while treating generic zh as zh-CN for recent matching', () => {
    const utterances = [
      {
        id: 'u-1',
        originalText: '你好',
        originalLang: 'zh-TW',
        translations: {},
      },
      {
        id: 'u-2',
        originalText: '你好',
        originalLang: 'zh-CN',
        translations: {},
      },
    ]

    expect(findRecentMatchingUtteranceIndex({
      utterances,
      sourceText: '你好',
      sourceLanguage: 'zh-TW',
    })).toBe(0)

    expect(findRecentMatchingUtteranceIndex({
      utterances,
      sourceText: '你好',
      sourceLanguage: 'zh',
    })).toBe(1)
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

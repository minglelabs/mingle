import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  LS_KEY_AD_BANNER_POSITION,
  LS_KEY_INPUT_MODE,
  LS_KEY_LANGUAGES,
  LS_KEY_SPEECH_LANGUAGES,
  LS_KEY_TEXT_SIZE_LEVEL,
  DEFAULT_SONIOX_SILENCE_MS,
  DEFAULT_TEXT_SIZE_LEVEL,
  MAX_SONIOX_SILENCE_MS,
  MIN_SONIOX_SILENCE_MS,
  normalizeLivePhoneDemoAdBannerPosition,
  normalizeLivePhoneDemoInputMode,
  readPersistedIntegerPreference,
  readPersistedLivePhoneDemoPreferences,
  resolveDisplayedLivePhoneDemoAdBannerPosition,
} from './live-phone-demo.preferences'

describe('readPersistedIntegerPreference', () => {
  it('falls back when the stored value is missing or blank', () => {
    expect(readPersistedIntegerPreference(null, DEFAULT_TEXT_SIZE_LEVEL, 1, 5)).toBe(DEFAULT_TEXT_SIZE_LEVEL)
    expect(readPersistedIntegerPreference('', DEFAULT_SONIOX_SILENCE_MS, MIN_SONIOX_SILENCE_MS, MAX_SONIOX_SILENCE_MS)).toBe(DEFAULT_SONIOX_SILENCE_MS)
    expect(readPersistedIntegerPreference('   ', DEFAULT_TEXT_SIZE_LEVEL, 1, 5)).toBe(DEFAULT_TEXT_SIZE_LEVEL)
  })

  it('uses the persisted value when it is valid', () => {
    expect(readPersistedIntegerPreference('5', DEFAULT_TEXT_SIZE_LEVEL, 1, 5)).toBe(5)
    expect(readPersistedIntegerPreference('3000', DEFAULT_SONIOX_SILENCE_MS, MIN_SONIOX_SILENCE_MS, MAX_SONIOX_SILENCE_MS)).toBe(3000)
  })

  it('falls back for invalid or non-positive values', () => {
    expect(readPersistedIntegerPreference('0', DEFAULT_TEXT_SIZE_LEVEL, 1, 5)).toBe(DEFAULT_TEXT_SIZE_LEVEL)
    expect(readPersistedIntegerPreference('-10', DEFAULT_SONIOX_SILENCE_MS, MIN_SONIOX_SILENCE_MS, MAX_SONIOX_SILENCE_MS)).toBe(DEFAULT_SONIOX_SILENCE_MS)
    expect(readPersistedIntegerPreference('not-a-number', DEFAULT_TEXT_SIZE_LEVEL, 1, 5)).toBe(DEFAULT_TEXT_SIZE_LEVEL)
  })

  it('clamps out-of-range persisted values', () => {
    expect(readPersistedIntegerPreference('99', DEFAULT_TEXT_SIZE_LEVEL, 1, 5)).toBe(5)
    expect(readPersistedIntegerPreference('1', DEFAULT_SONIOX_SILENCE_MS, MIN_SONIOX_SILENCE_MS, MAX_SONIOX_SILENCE_MS)).toBe(MIN_SONIOX_SILENCE_MS)
    expect(readPersistedIntegerPreference('99999', DEFAULT_SONIOX_SILENCE_MS, MIN_SONIOX_SILENCE_MS, MAX_SONIOX_SILENCE_MS)).toBe(MAX_SONIOX_SILENCE_MS)
  })
})

describe('normalizeLivePhoneDemoAdBannerPosition', () => {
  it('normalizes top and bottom values', () => {
    expect(normalizeLivePhoneDemoAdBannerPosition('top')).toBe('top')
    expect(normalizeLivePhoneDemoAdBannerPosition(' BOTTOM ')).toBe('bottom')
  })

  it('returns null for unsupported values', () => {
    expect(normalizeLivePhoneDemoAdBannerPosition('off')).toBeNull()
    expect(normalizeLivePhoneDemoAdBannerPosition('')).toBeNull()
    expect(normalizeLivePhoneDemoAdBannerPosition(null)).toBeNull()
  })
})

describe('normalizeLivePhoneDemoInputMode', () => {
  it('normalizes supported input mode values', () => {
    expect(normalizeLivePhoneDemoInputMode('voice')).toBe('voice')
    expect(normalizeLivePhoneDemoInputMode(' TEXT ')).toBe('text')
  })

  it('returns null for unsupported input mode values', () => {
    expect(normalizeLivePhoneDemoInputMode('keyboard')).toBeNull()
    expect(normalizeLivePhoneDemoInputMode('')).toBeNull()
    expect(normalizeLivePhoneDemoInputMode(null)).toBeNull()
  })
})

describe('resolveDisplayedLivePhoneDemoAdBannerPosition', () => {
  it('prefers hydrated user preference over native layout and query fallback', () => {
    expect(resolveDisplayedLivePhoneDemoAdBannerPosition({
      preferredPosition: 'bottom',
      nativeLayoutPosition: 'top',
      queryPosition: 'top',
    })).toBe('bottom')
  })

  it('falls back to native layout when no user preference is available', () => {
    expect(resolveDisplayedLivePhoneDemoAdBannerPosition({
      preferredPosition: null,
      nativeLayoutPosition: 'bottom',
      queryPosition: 'top',
    })).toBe('bottom')
  })

  it('falls back to query position last', () => {
    expect(resolveDisplayedLivePhoneDemoAdBannerPosition({
      preferredPosition: null,
      nativeLayoutPosition: null,
      queryPosition: 'top',
    })).toBe('top')
  })
})

describe('readPersistedLivePhoneDemoPreferences', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns fallback values when localStorage is unavailable', () => {
    expect(readPersistedLivePhoneDemoPreferences(['en', 'ko', 'ja'])).toEqual({
      selectedLanguages: ['en', 'ko', 'ja'],
      speechLanguages: ['en', 'ko', 'ja'],
      textSizeLevel: DEFAULT_TEXT_SIZE_LEVEL,
      adBannerPosition: null,
      inputMode: null,
    })
  })

  it('reads and sanitizes stored local preferences while keeping silence finalize at the default', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => {
        if (key === LS_KEY_LANGUAGES) return JSON.stringify(['ja-JP', 'en-US', 'en', 'bad'])
        if (key === LS_KEY_SPEECH_LANGUAGES) return JSON.stringify(['ko-KR', 'ja-JP', 'bogus'])
        if (key === LS_KEY_TEXT_SIZE_LEVEL) return '5'
        if (key === LS_KEY_AD_BANNER_POSITION) return 'bottom'
        if (key === LS_KEY_INPUT_MODE) return 'text'
        return null
      }),
    } as unknown as Storage)

    expect(readPersistedLivePhoneDemoPreferences(['ko', 'en'])).toEqual({
      selectedLanguages: ['ja', 'en'],
      speechLanguages: ['ko', 'ja'],
      textSizeLevel: 5,
      adBannerPosition: 'bottom',
      inputMode: 'text',
    })
  })

  it('falls back to defaults when stored preferences are malformed', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => {
        if (key === LS_KEY_LANGUAGES) return '{not-json}'
        if (key === LS_KEY_SPEECH_LANGUAGES) return '{not-json}'
        if (key === LS_KEY_TEXT_SIZE_LEVEL) return '0'
        if (key === LS_KEY_AD_BANNER_POSITION) return 'off'
        if (key === LS_KEY_INPUT_MODE) return 'unsupported'
        return null
      }),
    } as unknown as Storage)

    expect(readPersistedLivePhoneDemoPreferences(['en', 'ko'])).toEqual({
      selectedLanguages: ['en', 'ko'],
      speechLanguages: ['en', 'ko'],
      textSizeLevel: DEFAULT_TEXT_SIZE_LEVEL,
      adBannerPosition: null,
      inputMode: null,
    })
  })

  it('uses stored translation languages as the speech fallback for legacy clients', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => {
        if (key === LS_KEY_LANGUAGES) return JSON.stringify(['ja-JP', 'en-US'])
        return null
      }),
    } as unknown as Storage)

    expect(readPersistedLivePhoneDemoPreferences(['ko', 'en'])).toEqual({
      selectedLanguages: ['ja', 'en'],
      speechLanguages: ['ja', 'en'],
      textSizeLevel: DEFAULT_TEXT_SIZE_LEVEL,
      adBannerPosition: null,
      inputMode: null,
    })
  })
})

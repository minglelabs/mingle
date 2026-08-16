import { describe, expect, it } from 'vitest'

import {
  DEFAULT_STT_LANGUAGES,
  STT_LANGUAGE_CODES,
  STT_LANGUAGE_NAME_MAP,
  STT_LANGUAGE_OPTIONS,
  canonicalizeSonioxLanguageHintCode,
  canonicalizeSttLanguageCode,
  deriveDefaultConversationLanguages,
  deriveDefaultSttLanguagesForLocale,
  getSttLanguageFlag,
  getSttLanguageDisplayName,
} from '@/lib/stt-languages'

describe('STT language catalog', () => {
  it('contains the full selectable STT list with Chinese variants split', () => {
    expect(STT_LANGUAGE_CODES).toHaveLength(61)
    expect(STT_LANGUAGE_OPTIONS).toEqual(expect.arrayContaining([
      { code: 'af', englishName: 'Afrikaans', flag: '🇿🇦' },
      { code: 'zh-CN', englishName: 'Chinese Simplified', flag: '🇨🇳' },
      { code: 'zh-TW', englishName: 'Chinese Traditional', flag: '🇹🇼' },
      { code: 'he', englishName: 'Hebrew', flag: '🇮🇱' },
      { code: 'tl', englishName: 'Tagalog', flag: '🇵🇭' },
      { code: 'cy', englishName: 'Welsh', flag: '🇬🇧' },
    ]))
  })

  it('preserves the default starter languages', () => {
    expect(DEFAULT_STT_LANGUAGES).toEqual(['en', 'ko', 'ja'])
  })

  it('derives locale-aware starter languages with the preferred language first', () => {
    expect(deriveDefaultSttLanguagesForLocale('ja-JP')).toEqual(['ja', 'en', 'ko'])
    expect(deriveDefaultSttLanguagesForLocale('ko-KR')).toEqual(['ko', 'en', 'ja'])
    expect(deriveDefaultSttLanguagesForLocale('en-US')).toEqual(['en', 'ko', 'ja'])
    expect(deriveDefaultSttLanguagesForLocale('zh-TW')).toEqual(['zh-TW', 'en', 'ko'])
    expect(deriveDefaultSttLanguagesForLocale('zh')).toEqual(['zh-CN', 'en', 'ko'])
    expect(deriveDefaultSttLanguagesForLocale('fr-FR')).toEqual(['fr', 'en', 'ko'])
    expect(deriveDefaultSttLanguagesForLocale('eo-EO')).toEqual(['en', 'ko', 'ja'])
    expect(deriveDefaultSttLanguagesForLocale('')).toEqual(['en', 'ko', 'ja'])
  })

  it('puts the profile primary language before the default trio', () => {
    expect(deriveDefaultConversationLanguages(['ja', 'ko'], 'en')).toEqual(['ja', 'en', 'ko'])
    expect(deriveDefaultConversationLanguages('ko', 'en')).toEqual(['ko', 'en', 'ja'])
    expect(deriveDefaultConversationLanguages([], 'en')).toEqual(['en', 'ko', 'ja'])
  })

  it('exposes stable names and canonicalization for STT hints', () => {
    expect(STT_LANGUAGE_NAME_MAP.ko).toBe('Korean')
    expect(STT_LANGUAGE_NAME_MAP.cy).toBe('Welsh')
    expect(canonicalizeSttLanguageCode('fil-PH')).toBe('tl')
    expect(canonicalizeSttLanguageCode('iw-IL')).toBe('he')
    expect(canonicalizeSttLanguageCode('zh')).toBe('zh-CN')
    expect(canonicalizeSttLanguageCode('zh-TW')).toBe('zh-TW')
    expect(canonicalizeSonioxLanguageHintCode('zh-CN')).toBe('zh')
    expect(canonicalizeSonioxLanguageHintCode('zh-TW')).toBe('zh')
  })

  it('returns flags for canonical and aliased language codes', () => {
    expect(getSttLanguageFlag('af')).toBe('🇿🇦')
    expect(getSttLanguageFlag('zh')).toBe('🇨🇳')
    expect(getSttLanguageFlag('zh-TW')).toBe('🇹🇼')
    expect(getSttLanguageFlag('fil-PH')).toBe('🇵🇭')
    expect(getSttLanguageFlag('unknown')).toBe('🌐')
  })

  it('returns a localized full language name instead of a technical code', () => {
    expect(getSttLanguageDisplayName('ko', 'ko')).toBe('한국어')
    expect(getSttLanguageDisplayName('ko', 'en')).toBe('Korean')
    expect(getSttLanguageDisplayName('unknown', 'ko')).toBeNull()
  })
})

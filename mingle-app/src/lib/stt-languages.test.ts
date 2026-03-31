import { describe, expect, it } from 'vitest'

import {
  DEFAULT_STT_LANGUAGES,
  STT_LANGUAGE_CODES,
  STT_LANGUAGE_NAME_MAP,
  STT_LANGUAGE_OPTIONS,
  canonicalizeSttLanguageCode,
  deriveDefaultSttLanguagesForLocale,
  getSttLanguageFlag,
} from '@/lib/stt-languages'

describe('STT language catalog', () => {
  it('contains the full 60-language STT list', () => {
    expect(STT_LANGUAGE_CODES).toHaveLength(60)
    expect(STT_LANGUAGE_OPTIONS).toEqual(expect.arrayContaining([
      { code: 'af', englishName: 'Afrikaans', flag: '🇿🇦' },
      { code: 'zh', englishName: 'Chinese', flag: '🇨🇳' },
      { code: 'he', englishName: 'Hebrew', flag: '🇮🇱' },
      { code: 'tl', englishName: 'Tagalog', flag: '🇵🇭' },
      { code: 'cy', englishName: 'Welsh', flag: '🇬🇧' },
    ]))
  })

  it('preserves the default starter languages', () => {
    expect(DEFAULT_STT_LANGUAGES).toEqual(['en', 'ko', 'ja'])
  })

  it('derives locale-aware starter languages with English-first priority', () => {
    expect(deriveDefaultSttLanguagesForLocale('ja-JP')).toEqual(['en', 'ko', 'ja'])
    expect(deriveDefaultSttLanguagesForLocale('ko-KR')).toEqual(['en', 'ko', 'ja'])
    expect(deriveDefaultSttLanguagesForLocale('en-US')).toEqual(['en', 'ko', 'ja'])
    expect(deriveDefaultSttLanguagesForLocale('zh-TW')).toEqual(['en', 'zh', 'ko'])
    expect(deriveDefaultSttLanguagesForLocale('fr-FR')).toEqual(['en', 'fr', 'ko'])
    expect(deriveDefaultSttLanguagesForLocale('eo-EO')).toEqual(['en', 'ko', 'ja'])
    expect(deriveDefaultSttLanguagesForLocale('')).toEqual(['en', 'ko', 'ja'])
  })

  it('exposes stable names and canonicalization for STT hints', () => {
    expect(STT_LANGUAGE_NAME_MAP.ko).toBe('Korean')
    expect(STT_LANGUAGE_NAME_MAP.cy).toBe('Welsh')
    expect(canonicalizeSttLanguageCode('fil-PH')).toBe('tl')
    expect(canonicalizeSttLanguageCode('iw-IL')).toBe('he')
    expect(canonicalizeSttLanguageCode('zh-TW')).toBe('zh')
  })

  it('returns flags for canonical and aliased language codes', () => {
    expect(getSttLanguageFlag('af')).toBe('🇿🇦')
    expect(getSttLanguageFlag('zh-TW')).toBe('🇨🇳')
    expect(getSttLanguageFlag('fil-PH')).toBe('🇵🇭')
    expect(getSttLanguageFlag('unknown')).toBe('🌐')
  })
})

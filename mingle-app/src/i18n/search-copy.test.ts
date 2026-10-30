import { describe, expect, it } from 'vitest'
import { PRIMARY_UI_LOCALES } from '@/i18n/mingle-locales'
import { searchCopy } from './search-copy'

describe('search copy', () => {
  it.each(PRIMARY_UI_LOCALES)('provides every field non-empty in %s', locale => {
    const copy = searchCopy(locale)
    expect(Object.values(copy).every(value => typeof value === 'string' && value.trim().length > 0)).toBe(true)
  })

  it('translates the placeholder away from English for non-English locales', () => {
    const english = searchCopy('en')
    for (const locale of PRIMARY_UI_LOCALES) {
      if (locale === 'en') continue
      expect(searchCopy(locale).searchPlaceholder).not.toBe(english.searchPlaceholder)
    }
  })

  it('resolves regional and unknown tags to a primary UI locale with an English fallback', () => {
    expect(searchCopy('ko-KR').peopleHeading).toBe(searchCopy('ko').peopleHeading)
    expect(searchCopy('zh-Hant').postsHeading).toBe(searchCopy('zh-TW').postsHeading)
    // A supported-but-non-primary locale falls back to English copy.
    expect(searchCopy('sv').searchPlaceholder).toBe(searchCopy('en').searchPlaceholder)
    // An entirely unknown tag also falls back to English.
    expect(searchCopy('xx-YY').searchPlaceholder).toBe(searchCopy('en').searchPlaceholder)
  })
})

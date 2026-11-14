import { describe, expect, it } from 'vitest'
import { PRIMARY_UI_LOCALES } from '@/i18n/mingle-locales'
import { resolvePeopleDiscoveryCopy } from './people-discovery-copy'

describe('people discovery copy', () => {
  it('covers 15 primary UI locales', () => {
    expect(PRIMARY_UI_LOCALES).toHaveLength(15)
  })

  it.each(PRIMARY_UI_LOCALES)('provides every field non-empty in %s', locale => {
    const copy = resolvePeopleDiscoveryCopy(locale)
    expect(Object.values(copy).every(value => typeof value === 'string' && value.trim().length > 0)).toBe(true)
  })

  it('translates the headings away from English', () => {
    const english = resolvePeopleDiscoveryCopy('en')
    for (const locale of PRIMARY_UI_LOCALES) {
      if (locale === 'en') continue
      expect(resolvePeopleDiscoveryCopy(locale).headingForForeigner).not.toBe(english.headingForForeigner)
      expect(resolvePeopleDiscoveryCopy(locale).headingForKorean).not.toBe(english.headingForKorean)
    }
  })

  it('falls back to English for unknown tags', () => {
    expect(resolvePeopleDiscoveryCopy('xx-YY')).toEqual(resolvePeopleDiscoveryCopy('en'))
    expect(resolvePeopleDiscoveryCopy('ko-KR').badgeNew).toBe('신규')
  })
})

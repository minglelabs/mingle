import { describe, expect, it } from 'vitest'
import {
  NATIONALITY_COUNTRY_CODES,
  countryFlagEmoji,
  defaultNationalityForLanguage,
  getCountryDisplayName,
  normalizeNationalityCountry,
  resolveNationalityCountry,
} from '@/lib/nationality'
import { STT_LANGUAGE_OPTIONS } from '@/lib/stt-languages'

describe('nationality', () => {
  it('maps a language to the country of its flag', () => {
    expect(defaultNationalityForLanguage('ko')).toBe('KR')
    expect(defaultNationalityForLanguage('en')).toBe('US')
    expect(defaultNationalityForLanguage('ja')).toBe('JP')
    expect(defaultNationalityForLanguage('zh-TW')).toBe('TW')
    expect(defaultNationalityForLanguage('zh')).toBe('CN')
    expect(defaultNationalityForLanguage('pt')).toBe('PT')
    expect(defaultNationalityForLanguage('xx')).toBeNull()
    expect(defaultNationalityForLanguage(null)).toBeNull()
  })

  it('matches the flag every language picker shows', () => {
    for (const { code, flag } of STT_LANGUAGE_OPTIONS) {
      expect(countryFlagEmoji(defaultNationalityForLanguage(code) ?? ''), code).toBe(flag)
    }
  })

  it('prefers the stored country over the language mapping', () => {
    expect(resolveNationalityCountry('br', ['pt'])).toBe('BR')
    expect(resolveNationalityCountry(null, ['pt'])).toBe('PT')
    expect(resolveNationalityCountry('ZZ', ['ko'])).toBe('KR')
    expect(resolveNationalityCountry(undefined, [])).toBeNull()
  })

  it('accepts only ISO 3166-1 alpha-2 codes', () => {
    expect(normalizeNationalityCountry(' kr ')).toBe('KR')
    expect(normalizeNationalityCountry('KOR')).toBeNull()
    expect(normalizeNationalityCountry(1)).toBeNull()
    expect(NATIONALITY_COUNTRY_CODES).toHaveLength(249)
  })

  it('renders the flag and a localized name', () => {
    expect(countryFlagEmoji('KR')).toBe('🇰🇷')
    expect(countryFlagEmoji('nope')).toBe('🌐')
    expect(getCountryDisplayName('KR', 'ko')).toBe('대한민국')
    expect(getCountryDisplayName('JP', 'en')).toBe('Japan')
  })
})

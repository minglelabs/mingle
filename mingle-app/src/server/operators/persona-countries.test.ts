import { describe, expect, it } from 'vitest'
import { canonicalizeSttLanguageCode } from '@/lib/stt-languages'
import { countryFlagEmoji, findPersonaCity, findPersonaCountry, PERSONA_COUNTRIES, PERSONA_COUNTRY_PRESETS } from './persona-countries'
import { isHandleConflictError, operatorHandleCandidates } from './operator-handles'
import { validateOperatorHandle } from './persona-rules'

describe('persona country table', () => {
  it('has unique ISO codes, selectable languages and 2 dp city-center coordinates', () => {
    const codes = PERSONA_COUNTRIES.map(country => country.code)
    expect(new Set(codes).size).toBe(codes.length)
    for (const country of PERSONA_COUNTRIES) {
      expect(country.code).toMatch(/^[A-Z]{2}$/)
      expect(country.languages.length).toBeGreaterThan(0)
      for (const language of country.languages) expect(canonicalizeSttLanguageCode(language)).toBe(language)
      expect(new Set(country.cities.map(city => city.name)).size).toBe(country.cities.length)
      for (const city of country.cities) {
        expect(Math.abs(city.latitude)).toBeLessThanOrEqual(90)
        expect(Math.abs(city.longitude)).toBeLessThanOrEqual(180)
        expect(Math.round(city.latitude * 100) / 100).toBe(city.latitude)
        expect(Math.round(city.longitude * 100) / 100).toBe(city.longitude)
        expect(city.weight).toBeGreaterThan(0)
      }
    }
  })

  it('presets only name countries in the table', () => {
    for (const preset of PERSONA_COUNTRY_PRESETS) {
      for (const code of preset.codes) expect(findPersonaCountry(code)).not.toBeNull()
    }
  })

  it('finds countries and cities ignoring case and accents', () => {
    const brazil = findPersonaCountry(' br ')!
    expect(brazil.nameEn).toBe('Brazil')
    expect(findPersonaCity(brazil, 'sao paulo')?.name).toBe('São Paulo')
    expect(findPersonaCity(brazil, 'Lisbon')).toBeNull()
    expect(findPersonaCountry('XX')).toBeNull()
  })

  it('builds flag emoji from ISO codes', () => {
    expect(countryFlagEmoji('jp')).toBe('🇯🇵')
    expect(countryFlagEmoji('KOR')).toBe('')
  })
})

describe('operator handle candidates', () => {
  it('starts with the handle and adds natural numeric suffixes within 30 characters', () => {
    const candidates = operatorHandleCandidates('yuki.tnk', () => 0.5)
    expect(candidates[0]).toBe('yuki.tnk')
    expect(candidates.slice(1).every(candidate => /^yuki\.tnk\d{2,4}$/.test(candidate))).toBe(true)
    expect(operatorHandleCandidates('minjun_0412', () => 0.5)[1]).toMatch(/^minjun_0412_\d{2}$/)
    for (const candidate of operatorHandleCandidates('a'.repeat(30), () => 0.99)) {
      expect(candidate.length).toBeLessThanOrEqual(30)
      expect(validateOperatorHandle(candidate).ok).toBe(true)
    }
  })

  it('recognizes only unique-constraint errors on the handle', () => {
    expect(isHandleConflictError({ code: 'P2002', meta: { target: ['handle'] } })).toBe(true)
    expect(isHandleConflictError({ code: 'P2002', meta: { target: 'app_users_handle_key' } })).toBe(true)
    expect(isHandleConflictError({ code: 'P2002' })).toBe(true)
    expect(isHandleConflictError({ code: 'P2002', meta: { target: ['email'] } })).toBe(false)
    expect(isHandleConflictError({ code: 'P2025' })).toBe(false)
    expect(isHandleConflictError(new Error('boom'))).toBe(false)
  })
})

import { getSttLanguageDisplayName, STT_LANGUAGE_OPTIONS } from '@/lib/stt-languages'
import { countryFlagEmoji, findPersonaCountry, PERSONA_COUNTRIES, type PersonaCountry } from '@/server/operators/persona-countries'

/** Serializable option lists the server pages hand to the client forms. */

export type LanguageOption = { code: string; label: string }

export type CountryOption = Pick<PersonaCountry, 'code' | 'nameKo' | 'nameEn' | 'languages'> & {
  flag: string
  cities: string[]
}

export function koreanLanguageName(code: string | null | undefined): string {
  if (!code) return '언어 없음'
  return getSttLanguageDisplayName(code, 'ko') ?? code
}

export function buildLanguageOptions(): LanguageOption[] {
  return STT_LANGUAGE_OPTIONS
    .map(option => ({ code: option.code, label: koreanLanguageName(option.code) }))
    .sort((a, b) => a.label.localeCompare(b.label, 'ko'))
}

export function buildCountryOptions(): CountryOption[] {
  return PERSONA_COUNTRIES.map(country => ({
    code: country.code,
    nameKo: country.nameKo,
    nameEn: country.nameEn,
    languages: country.languages,
    flag: countryFlagEmoji(country.code),
    cities: country.cities.map(city => city.name),
  }))
}

/** "🇯🇵 일본" for a persona country code (the code itself when it is not in the table). */
export function countryLabel(code: string | null | undefined): string {
  const country = findPersonaCountry(code)
  if (!country) return code ?? '나라 없음'
  return `${countryFlagEmoji(country.code)} ${country.nameKo}`
}

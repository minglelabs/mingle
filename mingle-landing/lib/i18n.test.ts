import { describe, expect, it } from 'vitest'

import ar from '@/locales/ar.json'
import de from '@/locales/de.json'
import en from '@/locales/en.json'
import es from '@/locales/es.json'
import fr from '@/locales/fr.json'
import hi from '@/locales/hi.json'
import itLocale from '@/locales/it.json'
import ja from '@/locales/ja.json'
import ko from '@/locales/ko.json'
import pt from '@/locales/pt.json'
import ru from '@/locales/ru.json'
import th from '@/locales/th.json'
import vi from '@/locales/vi.json'
import zhCN from '@/locales/zh-CN.json'
import zhTW from '@/locales/zh-TW.json'
import { languages, resolveLandingLocale, resolvePreferredLandingLocale } from '@/lib/i18n'
import { PRIMARY_UI_LANGUAGE_OPTIONS, PRIMARY_UI_LOCALES } from '../../shared/i18n/mingle-locales'

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

function flattenKeys(value: JsonValue, prefix = ''): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => flattenKeys(entry, `${prefix}[${index}]`))
  }

  if (typeof value !== 'object' || value === null) {
    return prefix ? [prefix] : []
  }

  return Object.entries(value).flatMap(([key, child]) => {
    const nextPrefix = prefix ? `${prefix}.${key}` : key
    return flattenKeys(child, nextPrefix)
  })
}

describe('landing i18n adapter', () => {
  it('normalizes raw locale tags onto the shared primary-ui catalog', () => {
    expect(resolveLandingLocale('fr-CA')).toBe('fr')
    expect(resolveLandingLocale('zh-Hant-HK')).toBe('zh-TW')
    expect(resolveLandingLocale('pl-PL')).toBe('en')
    expect(resolveLandingLocale(undefined)).toBe('en')
    expect(languages).toHaveLength(15)
    expect(languages).toEqual(PRIMARY_UI_LANGUAGE_OPTIONS)
    expect(languages.map(({ code }) => code).sort()).toEqual([...PRIMARY_UI_LOCALES].sort())
  })

  it('prefers persisted locale over browser locale for client-only fallback routing', () => {
    expect(resolvePreferredLandingLocale({
      storedLocale: 'ja',
      navigatorLocale: 'fr-CA',
    })).toBe('ja')
    expect(resolvePreferredLandingLocale({
      storedLocale: null,
      navigatorLocale: 'fr-CA',
    })).toBe('fr')
  })

  it('keeps every landing locale JSON aligned with the English keyset', () => {
    const englishKeys = flattenKeys(en).sort()
    const localeMaps = [ko, ja, zhCN, zhTW, fr, de, es, pt, itLocale, ru, ar, hi, th, vi]

    for (const localeMap of localeMaps) {
      expect(flattenKeys(localeMap).sort()).toEqual(englishKeys)
    }
  })
})

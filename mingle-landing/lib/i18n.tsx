'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  PRIMARY_UI_LANGUAGE_OPTIONS,
  resolvePrimaryUiLocaleTag,
  type PrimaryUiLocale,
} from '../../shared/i18n/mingle-locales'

import en from '@/locales/en.json'
import ko from '@/locales/ko.json'
import fr from '@/locales/fr.json'
import ja from '@/locales/ja.json'
import zhCN from '@/locales/zh-CN.json'
import zhTW from '@/locales/zh-TW.json'
import th from '@/locales/th.json'
import hi from '@/locales/hi.json'
import pt from '@/locales/pt.json'
import de from '@/locales/de.json'
import it from '@/locales/it.json'
import es from '@/locales/es.json'
import vi from '@/locales/vi.json'
import ru from '@/locales/ru.json'
import ar from '@/locales/ar.json'

type TranslationValue =
  | string
  | number
  | boolean
  | null
  | TranslationObject
  | TranslationValue[]

type TranslationObject = {
  [key: string]: TranslationValue
}

type TranslationOptions = {
  defaultValue?: unknown
  returnObjects?: boolean
}

type TranslateFunction = (key: string, options?: TranslationOptions) => any

type LandingI18nContextValue = {
  language: PrimaryUiLocale
  changeLanguage: (nextLanguage: string) => void
}

type TranslationResourceMap = Record<PrimaryUiLocale, TranslationObject>

const LOCALE_STORAGE_KEY = 'i18nextLng'

const resources: TranslationResourceMap = {
  en,
  ko,
  ja,
  'zh-CN': zhCN,
  'zh-TW': zhTW,
  fr,
  de,
  es,
  pt,
  it,
  ru,
  ar,
  hi,
  th,
  vi,
}

const LandingI18nContext = createContext<LandingI18nContextValue | null>(null)

export const languages = PRIMARY_UI_LANGUAGE_OPTIONS

export function resolveLandingLocale(rawLocale: string | null | undefined): PrimaryUiLocale {
  if (typeof rawLocale !== 'string') return 'en'
  return resolvePrimaryUiLocaleTag(rawLocale) ?? 'en'
}

function readNestedValue(source: TranslationObject, key: string): TranslationValue | undefined {
  const segments = key.split('.').filter(Boolean)
  if (segments.length === 0) return undefined

  let current: TranslationValue | undefined = source
  for (const segment of segments) {
    if (typeof current !== 'object' || current === null || Array.isArray(current)) {
      return undefined
    }
    current = (current as TranslationObject)[segment]
  }

  return current
}

function coerceTranslationValue(
  value: TranslationValue | undefined,
  key: string,
  options?: TranslationOptions,
): any {
  if (value === undefined) {
    return options?.defaultValue ?? key
  }

  if (options?.returnObjects) {
    return value
  }

  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value === null) return ''

  return options?.defaultValue ?? key
}

function translateValue(
  language: PrimaryUiLocale,
  key: string,
  options?: TranslationOptions,
): any {
  const currentDictionary = resources[language] ?? resources.en
  const currentValue = readNestedValue(currentDictionary, key)
  if (currentValue !== undefined) {
    return coerceTranslationValue(currentValue, key, options)
  }

  const fallbackValue = language === 'en'
    ? undefined
    : readNestedValue(resources.en, key)

  if (fallbackValue !== undefined) {
    return coerceTranslationValue(fallbackValue, key, options)
  }

  return coerceTranslationValue(undefined, key, options)
}

export function LandingI18nProvider(props: {
  children: ReactNode
  initialLocale?: string
}) {
  const { children, initialLocale } = props
  const [language, setLanguage] = useState<PrimaryUiLocale>(() => resolveLandingLocale(initialLocale))

  useEffect(() => {
    setLanguage(resolveLandingLocale(initialLocale))
  }, [initialLocale])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(LOCALE_STORAGE_KEY, language)
  }, [language])

  const changeLanguage = useCallback((nextLanguage: string) => {
    setLanguage(resolveLandingLocale(nextLanguage))
  }, [])

  const value = useMemo<LandingI18nContextValue>(() => ({
    language,
    changeLanguage,
  }), [changeLanguage, language])

  return (
    <LandingI18nContext.Provider value={value}>
      {children}
    </LandingI18nContext.Provider>
  )
}

export function useTranslation(): {
  t: TranslateFunction
  i18n: {
    language: PrimaryUiLocale
    changeLanguage: (nextLanguage: string) => void
  }
} {
  const context = useContext(LandingI18nContext)

  if (!context) {
    throw new Error('useTranslation must be used within LandingI18nProvider')
  }

  const t = useCallback<TranslateFunction>((key, options) => (
    translateValue(context.language, key, options)
  ), [context.language])

  const i18n = useMemo(() => ({
    language: context.language,
    changeLanguage: context.changeLanguage,
  }), [context.changeLanguage, context.language])

  return { t, i18n }
}

export function readPersistedLandingLocale(): PrimaryUiLocale | null {
  if (typeof window === 'undefined') return null
  const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY)
  return stored ? resolveLandingLocale(stored) : null
}

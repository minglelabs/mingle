import {
  SELECTABLE_TRANSLATION_LANGUAGES,
  canonicalizeTranslationLanguageCode,
  type TranslationLanguageCode,
} from '@/lib/translation-languages'

export type SttLanguageCode = (typeof SELECTABLE_TRANSLATION_LANGUAGES)[number]['code']
export type SttLanguageOption = {
  code: SttLanguageCode
  englishName: string
  flag: string
}

export const DEFAULT_STT_LANGUAGES = ['en', 'ko', 'ja'] as const satisfies readonly SttLanguageCode[]
const DEFAULT_STT_LANGUAGE_SET = new Set<SttLanguageCode>(DEFAULT_STT_LANGUAGES)

const STT_LANGUAGE_FLAG_MAP: Record<TranslationLanguageCode, string> = {
  af: '🇿🇦',
  sq: '🇦🇱',
  ar: '🇸🇦',
  az: '🇦🇿',
  eu: '🇪🇸',
  be: '🇧🇾',
  bn: '🇧🇩',
  bs: '🇧🇦',
  bg: '🇧🇬',
  ca: '🇪🇸',
  zh: '🇨🇳',
  'zh-CN': '🇨🇳',
  'zh-TW': '🇹🇼',
  hr: '🇭🇷',
  cs: '🇨🇿',
  da: '🇩🇰',
  nl: '🇳🇱',
  en: '🇺🇸',
  et: '🇪🇪',
  fi: '🇫🇮',
  fr: '🇫🇷',
  gl: '🇪🇸',
  de: '🇩🇪',
  el: '🇬🇷',
  gu: '🇮🇳',
  he: '🇮🇱',
  hi: '🇮🇳',
  hu: '🇭🇺',
  id: '🇮🇩',
  it: '🇮🇹',
  ja: '🇯🇵',
  kn: '🇮🇳',
  kk: '🇰🇿',
  ko: '🇰🇷',
  lv: '🇱🇻',
  lt: '🇱🇹',
  mk: '🇲🇰',
  ms: '🇲🇾',
  ml: '🇮🇳',
  mr: '🇮🇳',
  no: '🇳🇴',
  fa: '🇮🇷',
  pl: '🇵🇱',
  pt: '🇵🇹',
  pa: '🇮🇳',
  ro: '🇷🇴',
  ru: '🇷🇺',
  sr: '🇷🇸',
  sk: '🇸🇰',
  sl: '🇸🇮',
  es: '🇪🇸',
  sw: '🇹🇿',
  sv: '🇸🇪',
  tl: '🇵🇭',
  ta: '🇮🇳',
  te: '🇮🇳',
  th: '🇹🇭',
  tr: '🇹🇷',
  uk: '🇺🇦',
  ur: '🇵🇰',
  vi: '🇻🇳',
  cy: '🇬🇧',
}

export const STT_LANGUAGE_OPTIONS: SttLanguageOption[] = SELECTABLE_TRANSLATION_LANGUAGES.map((language) => ({
  ...language,
  flag: STT_LANGUAGE_FLAG_MAP[language.code],
}))

export const STT_LANGUAGE_CODES = STT_LANGUAGE_OPTIONS.map(({ code }) => code)
const STT_LANGUAGE_CODE_SET = new Set<SttLanguageCode>(STT_LANGUAGE_CODES)

export const STT_LANGUAGE_NAME_MAP: Record<SttLanguageCode, string> = Object.fromEntries(
  STT_LANGUAGE_OPTIONS.map(({ code, englishName }) => [code, englishName]),
) as Record<SttLanguageCode, string>

function isSupportedSttLanguageCode(value: string): value is SttLanguageCode {
  return STT_LANGUAGE_CODE_SET.has(value as SttLanguageCode)
}

export function canonicalizeSttLanguageCode(rawValue: string): SttLanguageCode | '' {
  const canonical = canonicalizeTranslationLanguageCode(rawValue)
  if (!canonical) return ''

  const selectableCode = canonical === 'zh' ? 'zh-CN' : canonical
  return isSupportedSttLanguageCode(selectableCode) ? selectableCode : ''
}

export function getSttLanguageDisplayName(
  rawValue: string,
  locale = 'en',
): string | null {
  const canonical = canonicalizeSttLanguageCode(rawValue)
  if (!canonical) return null

  const fallback = STT_LANGUAGE_OPTIONS.find((option) => option.code === canonical)?.englishName ?? null
  const locales = [locale.trim(), 'en'].filter((candidate, index, candidates) => (
    candidate.length > 0 && candidates.indexOf(candidate) === index
  ))

  for (const displayLocale of locales) {
    try {
      const displayName = new Intl.DisplayNames([displayLocale], { type: 'language' }).of(canonical)?.trim()
      if (displayName) return displayName
    } catch {
      // Try the English fallback locale before using the catalog name.
    }
  }

  return fallback
}

export function canonicalizeSonioxLanguageHintCode(rawValue: string): string {
  const canonical = canonicalizeTranslationLanguageCode(rawValue)
  if (!canonical) return ''
  if (canonical === 'zh-CN' || canonical === 'zh-TW') return 'zh'
  return canonical
}

export function sanitizeSttLanguageSelection(
  rawValue: unknown,
  fallbackLanguages: readonly string[] = [],
): SttLanguageCode[] {
  const fallback = fallbackLanguages
    .map((language) => canonicalizeSttLanguageCode(language))
    .filter((language): language is SttLanguageCode => Boolean(language))

  if (!Array.isArray(rawValue)) {
    return fallback.length > 0 ? [...fallback] : []
  }

  const deduped: SttLanguageCode[] = []
  for (const item of rawValue) {
    if (typeof item !== 'string') continue
    const normalized = canonicalizeSttLanguageCode(item)
    if (!normalized || deduped.includes(normalized)) continue
    deduped.push(normalized)
    if (deduped.length >= 5) break
  }

  return deduped.length > 0
    ? deduped
    : (fallback.length > 0 ? [...fallback] : [])
}

export function deriveDefaultSttLanguagesForLocale(rawLocale: string | null | undefined): SttLanguageCode[] {
  const localeLanguage = typeof rawLocale === 'string'
    ? canonicalizeSttLanguageCode(rawLocale)
    : ''

  if (!localeLanguage || DEFAULT_STT_LANGUAGE_SET.has(localeLanguage)) {
    return [...DEFAULT_STT_LANGUAGES]
  }

  const prioritized: SttLanguageCode[] = ['en', localeLanguage, 'ko', 'ja']
  const deduped: SttLanguageCode[] = []
  for (const language of prioritized) {
    if (deduped.includes(language)) continue
    deduped.push(language)
    if (deduped.length >= DEFAULT_STT_LANGUAGES.length) break
  }

  return deduped
}

export function getSttLanguageFlag(rawValue: string): string {
  const canonical = canonicalizeTranslationLanguageCode(rawValue)
  if (!canonical) return '🌐'
  return STT_LANGUAGE_FLAG_MAP[canonical] || '🌐'
}

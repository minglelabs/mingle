import { DEFAULT_LOCALE, resolveSupportedLocaleTag, type AppLocale } from '@/i18n'
import { canonicalizeSttLanguageCode, type SttLanguageCode } from '@/lib/stt-languages'

export const LANGUAGE_ONBOARDING_MAX_TARGET_LANGUAGES = 5

export function shouldAutoOpenLanguageOnboarding(hasConfirmedOnboarding: boolean): boolean {
  return !hasConfirmedOnboarding
}

export function resolveOnboardingDefaultSourceLanguage(
  speechLanguages: readonly string[],
  uiLocale: string,
): SttLanguageCode {
  for (const language of speechLanguages) {
    const normalized = canonicalizeSttLanguageCode(language)
    if (normalized) return normalized
  }

  return canonicalizeSttLanguageCode(uiLocale) || 'en'
}

export function resolveOnboardingDefaultTargetLanguages(
  selectedLanguages: readonly string[],
  fallbackSourceLanguage: string,
): SttLanguageCode[] {
  const deduped: SttLanguageCode[] = []
  for (const language of selectedLanguages) {
    const normalized = canonicalizeSttLanguageCode(language)
    if (!normalized || deduped.includes(normalized)) continue
    deduped.push(normalized)
    if (deduped.length >= LANGUAGE_ONBOARDING_MAX_TARGET_LANGUAGES) break
  }

  if (deduped.length > 0) return deduped

  const fallback = canonicalizeSttLanguageCode(fallbackSourceLanguage)
  return fallback ? [fallback] : []
}

export function resolveUiLocaleForSourceLanguage(sourceLanguageCode: string): AppLocale {
  return resolveSupportedLocaleTag(sourceLanguageCode) ?? DEFAULT_LOCALE
}

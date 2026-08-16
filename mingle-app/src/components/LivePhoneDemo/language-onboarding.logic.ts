import { DEFAULT_LOCALE, resolveSupportedLocaleTag, type AppLocale } from '@/i18n'
import { canonicalizeSttLanguageCode, type SttLanguageCode } from '@/lib/stt-languages'

export function shouldAutoOpenLanguageOnboarding(hasConfirmedOnboarding: boolean): boolean {
  return !hasConfirmedOnboarding
}

export function resolveOnboardingDefaultLanguage(
  persistedLanguages: readonly string[],
  uiLocale: string,
): SttLanguageCode {
  const normalizedPersistedLanguages = persistedLanguages
    .map((language) => canonicalizeSttLanguageCode(language))
    .filter((language): language is SttLanguageCode => Boolean(language))

  // A brand-new user's persisted language list is the fixed default triple, not a
  // real recorded choice -- when the current ui locale is among the options, prefer
  // it over "whichever one happens to be listed first" so onboarding defaults to the
  // language the user is actually browsing in.
  const normalizedUiLocale = canonicalizeSttLanguageCode(uiLocale)
  if (normalizedUiLocale && normalizedPersistedLanguages.includes(normalizedUiLocale)) {
    return normalizedUiLocale
  }

  if (normalizedPersistedLanguages.length > 0) return normalizedPersistedLanguages[0]

  return normalizedUiLocale || 'en'
}

export function resolveUiLocaleForLanguage(languageCode: string): AppLocale {
  return resolveSupportedLocaleTag(languageCode) ?? DEFAULT_LOCALE
}

import type { LanguageOnboardingConfirmPayload } from '@/components/LivePhoneDemo/LanguageOnboardingModal'
import {
  LS_KEY_LANGUAGE_ONBOARDING_CONFIRMED,
  LS_KEY_LANGUAGES,
  LS_KEY_PENDING_BIRTH_DATE,
  LS_KEY_PENDING_DEFAULT_CONVERSATION_LANGUAGES,
  LS_KEY_PENDING_DISCOVERY_SOURCE,
  LS_KEY_PENDING_GENDER,
  LS_KEY_PENDING_INTEREST_LANGUAGES,
  LS_KEY_PENDING_PRIMARY_LANGUAGES,
  LS_KEY_PENDING_USAGE_PURPOSE,
  LS_KEY_PENDING_USAGE_PURPOSE_NOTE,
  LS_KEY_TRANSLATION_LANGUAGES_LINKED,
  readPersistedBooleanPreference,
} from '@/components/LivePhoneDemo/live-phone-demo.preferences'
import { formatBirthDate } from '@/lib/birth-date'
import { deriveDefaultSttLanguagesForLocale, sanitizeSttLanguageSelection } from '@/lib/stt-languages'

type OnboardingStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export type LanguageOnboardingChoice = {
  languageCode: string
  defaultConversationLanguages: string[]
  primaryLanguages: string[]
  formattedBirthDate: string | null
  gender: LanguageOnboardingConfirmPayload['gender'] | null
  discoverySource: LanguageOnboardingConfirmPayload['discoverySource'] | null
  usagePurpose: LanguageOnboardingConfirmPayload['usagePurpose'] | null
  usagePurposeNote: string | null
  interestLanguages: NonNullable<LanguageOnboardingConfirmPayload['interestLanguage']>[]
}

function resolveBrowserStorage(): OnboardingStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

/** True once this device has finished the onboarding screens. */
export function hasConfirmedLanguageOnboarding(storage: OnboardingStorage | null = resolveBrowserStorage()): boolean {
  try {
    return readPersistedBooleanPreference(
      storage?.getItem(LS_KEY_LANGUAGE_ONBOARDING_CONFIRMED) ?? null,
      false,
    )
  } catch {
    return false
  }
}

export function markLanguageOnboardingConfirmed(storage: OnboardingStorage | null = resolveBrowserStorage()): void {
  try {
    storage?.setItem(LS_KEY_LANGUAGE_ONBOARDING_CONFIRMED, '1')
  } catch {
    // Ignore storage failures; the onboarding modal will simply reopen next launch.
  }
}

/**
 * Keeps what onboarding collected on the device. Sign-up reads these pending
 * values, so onboarding can run before the account exists — from the
 * conversation tab or from the feed's sign-in gate.
 */
export function persistLanguageOnboardingChoice(
  payload: LanguageOnboardingConfirmPayload | string,
  storage: OnboardingStorage | null = resolveBrowserStorage(),
): LanguageOnboardingChoice {
  const details = typeof payload === 'object' && payload ? payload : null
  const languageCode = typeof payload === 'string' ? payload : payload.language
  const formattedBirthDate = details?.birthDate ? formatBirthDate(details.birthDate) : null
  const gender = details?.gender ?? null
  const discoverySource = details?.discoverySource ?? null
  const usagePurpose = details?.usagePurpose ?? null
  const usagePurposeNote = details?.usagePurposeNote ?? null
  const interestLanguages = details?.interestLanguage ? [details.interestLanguage] : []

  // Seed the room's default output languages from the chosen app language the
  // same way a brand-new conversation would (chosen language + en/ko/ja, deduped),
  // not just the single picked language -- see deriveDefaultSttLanguagesForLocale.
  const defaultConversationLanguages = deriveDefaultSttLanguagesForLocale(languageCode)
  const primaryLanguages = sanitizeSttLanguageSelection(
    [languageCode],
    defaultConversationLanguages.slice(0, 1),
  )

  try {
    if (storage) {
      storage.setItem(LS_KEY_LANGUAGES, JSON.stringify(defaultConversationLanguages))
      storage.setItem(LS_KEY_TRANSLATION_LANGUAGES_LINKED, '0')
      storage.setItem(
        LS_KEY_PENDING_DEFAULT_CONVERSATION_LANGUAGES,
        JSON.stringify(defaultConversationLanguages),
      )
      storage.setItem(LS_KEY_PENDING_PRIMARY_LANGUAGES, JSON.stringify(primaryLanguages))
      if (formattedBirthDate) storage.setItem(LS_KEY_PENDING_BIRTH_DATE, formattedBirthDate)
      if (discoverySource) storage.setItem(LS_KEY_PENDING_DISCOVERY_SOURCE, discoverySource)
      if (gender) storage.setItem(LS_KEY_PENDING_GENDER, gender)
      if (usagePurpose) {
        storage.setItem(LS_KEY_PENDING_USAGE_PURPOSE, usagePurpose)
        if (usagePurposeNote) {
          storage.setItem(LS_KEY_PENDING_USAGE_PURPOSE_NOTE, usagePurposeNote)
        } else {
          storage.removeItem(LS_KEY_PENDING_USAGE_PURPOSE_NOTE)
        }
      }
      if (interestLanguages.length > 0) {
        storage.setItem(LS_KEY_PENDING_INTEREST_LANGUAGES, JSON.stringify(interestLanguages))
      }
    }
  } catch {
    // Ignore storage failures; the onboarding modal will simply reopen next launch.
  }

  return {
    languageCode,
    defaultConversationLanguages,
    primaryLanguages,
    formattedBirthDate,
    gender,
    discoverySource,
    usagePurpose,
    usagePurposeNote,
    interestLanguages,
  }
}

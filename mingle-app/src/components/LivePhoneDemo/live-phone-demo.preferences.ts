import { sanitizeSttLanguageSelection } from '@/lib/stt-languages'

export const LS_KEY_LANGUAGES = 'mingle_demo_languages'
export const LS_KEY_SPEECH_LANGUAGES = 'mingle_demo_speech_languages'
export const LS_KEY_TRANSLATION_LANGUAGES_LINKED = 'mingle_demo_translation_languages_linked'
export const LS_KEY_TEXT_SIZE_LEVEL = 'mingle_demo_text_size_level'
export const LS_KEY_AD_BANNER_POSITION = 'mingle_demo_ad_banner_position'
export const LS_KEY_INPUT_MODE = 'mingle_demo_input_mode'
export const DEFAULT_TEXT_SIZE_LEVEL = 3
export const DEFAULT_SONIOX_SILENCE_MS = 500
export const MIN_SONIOX_SILENCE_MS = 500
export const MAX_SONIOX_SILENCE_MS = 3000
export type LivePhoneDemoAdBannerPosition = 'top' | 'bottom'
export type LivePhoneDemoInputMode = 'voice' | 'text'
export const DEFAULT_INPUT_MODE: LivePhoneDemoInputMode = 'voice'

export interface LivePhoneDemoPersistedPreferences {
  selectedLanguages: string[]
  speechLanguages: string[]
  translationLanguagesLinked: boolean
  textSizeLevel: number
  adBannerPosition: LivePhoneDemoAdBannerPosition | null
  inputMode: LivePhoneDemoInputMode | null
}

export function readPersistedIntegerPreference(
  rawValue: string | null,
  fallback: number,
  min: number,
  max: number,
): number {
  if (rawValue === null) return fallback

  const trimmed = rawValue.trim()
  if (trimmed === '') return fallback

  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback

  return Math.max(min, Math.min(max, Math.floor(parsed)))
}

export function normalizeLivePhoneDemoAdBannerPosition(value: unknown): LivePhoneDemoAdBannerPosition | null {
  if (typeof value !== 'string') return null

  const normalized = value.trim().toLowerCase()
  return normalized === 'top' || normalized === 'bottom'
    ? normalized
    : null
}

export function normalizeLivePhoneDemoInputMode(value: unknown): LivePhoneDemoInputMode | null {
  if (typeof value !== 'string') return null

  const normalized = value.trim().toLowerCase()
  return normalized === 'voice' || normalized === 'text'
    ? normalized
    : null
}

export function readPersistedBooleanPreference(rawValue: string | null, fallback: boolean): boolean {
  if (rawValue === null) return fallback

  const normalized = rawValue.trim().toLowerCase()
  if (normalized === '1' || normalized === 'true') return true
  if (normalized === '0' || normalized === 'false') return false
  return fallback
}

export function resolveDisplayedLivePhoneDemoAdBannerPosition(input: {
  preferredPosition: LivePhoneDemoAdBannerPosition | null
  nativeLayoutPosition: LivePhoneDemoAdBannerPosition | null
  queryPosition: LivePhoneDemoAdBannerPosition | null
}): LivePhoneDemoAdBannerPosition | null {
  return input.preferredPosition
    ?? input.nativeLayoutPosition
    ?? input.queryPosition
    ?? null
}

export function readPersistedLivePhoneDemoPreferences(fallbackLanguages: string[]): LivePhoneDemoPersistedPreferences {
  const next: LivePhoneDemoPersistedPreferences = {
    selectedLanguages: [...fallbackLanguages],
    speechLanguages: [...fallbackLanguages],
    translationLanguagesLinked: true,
    textSizeLevel: DEFAULT_TEXT_SIZE_LEVEL,
    adBannerPosition: null,
    inputMode: null,
  }

  const storage = typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage
  if (!storage) return next

  try {
    const storedLanguages = storage.getItem(LS_KEY_LANGUAGES)
    if (storedLanguages) {
      next.selectedLanguages = sanitizeSttLanguageSelection(JSON.parse(storedLanguages), fallbackLanguages)
      next.speechLanguages = [...next.selectedLanguages]
    }
  } catch {
    next.selectedLanguages = [...fallbackLanguages]
    next.speechLanguages = [...fallbackLanguages]
  }

  try {
    const storedSpeechLanguages = storage.getItem(LS_KEY_SPEECH_LANGUAGES)
    if (storedSpeechLanguages) {
      next.speechLanguages = sanitizeSttLanguageSelection(JSON.parse(storedSpeechLanguages), fallbackLanguages)
    }
  } catch {
    next.speechLanguages = [...fallbackLanguages]
  }

  try {
    next.translationLanguagesLinked = readPersistedBooleanPreference(
      storage.getItem(LS_KEY_TRANSLATION_LANGUAGES_LINKED),
      true,
    )
  } catch {
    next.translationLanguagesLinked = true
  }

  if (next.translationLanguagesLinked) {
    next.selectedLanguages = [...next.speechLanguages]
  }

  try {
    next.textSizeLevel = readPersistedIntegerPreference(
      storage.getItem(LS_KEY_TEXT_SIZE_LEVEL),
      DEFAULT_TEXT_SIZE_LEVEL,
      1,
      5,
    )
  } catch { /* ignore */ }

  try {
    next.adBannerPosition = normalizeLivePhoneDemoAdBannerPosition(storage.getItem(LS_KEY_AD_BANNER_POSITION))
  } catch { /* ignore */ }

  try {
    next.inputMode = normalizeLivePhoneDemoInputMode(storage.getItem(LS_KEY_INPUT_MODE))
  } catch { /* ignore */ }

  return next
}

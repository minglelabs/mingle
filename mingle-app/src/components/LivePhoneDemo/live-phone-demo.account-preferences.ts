import {
  DEFAULT_SONIOX_SILENCE_MS,
  DEFAULT_TEXT_SIZE_LEVEL,
  MAX_SONIOX_SILENCE_MS,
  MIN_SONIOX_SILENCE_MS,
  normalizeLivePhoneDemoAdBannerPosition,
  type LivePhoneDemoAdBannerPosition,
} from './live-phone-demo.preferences'
import {
  DEFAULT_SELECTABLE_TRANSLATION_MODEL,
  normalizeSelectableTranslationModel,
  type UserSelectableTranslationModel,
} from '@/lib/translation-models'

const MIN_TEXT_SIZE_LEVEL = 1
const MAX_TEXT_SIZE_LEVEL = 5
export const DEFAULT_SPEAKER_ENABLED = false
export const DEFAULT_ECHO_ALLOWED = true

export type AccountPreferencesResponse = {
  textSizeLevel?: unknown
  sonioxManualFinalizeSilenceMs?: unknown
  translationModel?: unknown
  adBannerPosition?: unknown
  speakerEnabled?: unknown
  echoAllowed?: unknown
}

export interface LivePhoneDemoAccountPreferences {
  textSizeLevel: number
  sonioxManualFinalizeSilenceMs: number
  translationModel: UserSelectableTranslationModel
  adBannerPosition: LivePhoneDemoAdBannerPosition | null
  speakerEnabled: boolean
  echoAllowed: boolean
}

function normalizeIntegerPreference(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }

  return Math.max(min, Math.min(max, Math.floor(parsed)))
}

export function normalizeTextSizePreference(value: unknown): number {
  return normalizeIntegerPreference(value, DEFAULT_TEXT_SIZE_LEVEL, MIN_TEXT_SIZE_LEVEL, MAX_TEXT_SIZE_LEVEL)
}

export function normalizeSonioxManualFinalizeSilencePreference(value: unknown): number {
  return normalizeIntegerPreference(value, DEFAULT_SONIOX_SILENCE_MS, MIN_SONIOX_SILENCE_MS, MAX_SONIOX_SILENCE_MS)
}

function normalizeBooleanPreference(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

export function buildHydratedAccountPreferences(
  body: AccountPreferencesResponse | null | undefined,
  isLegacySonioxSilenceSliderNamespace: boolean,
): LivePhoneDemoAccountPreferences {
  return {
    textSizeLevel: normalizeTextSizePreference(body?.textSizeLevel),
    sonioxManualFinalizeSilenceMs: isLegacySonioxSilenceSliderNamespace
      ? DEFAULT_SONIOX_SILENCE_MS
      : normalizeSonioxManualFinalizeSilencePreference(body?.sonioxManualFinalizeSilenceMs),
    translationModel: normalizeSelectableTranslationModel(body?.translationModel) || DEFAULT_SELECTABLE_TRANSLATION_MODEL,
    adBannerPosition: normalizeLivePhoneDemoAdBannerPosition(body?.adBannerPosition),
    speakerEnabled: normalizeBooleanPreference(body?.speakerEnabled, DEFAULT_SPEAKER_ENABLED),
    echoAllowed: normalizeBooleanPreference(body?.echoAllowed, DEFAULT_ECHO_ALLOWED),
  }
}

export function serializeAccountPreferencesSyncState(
  preferences: LivePhoneDemoAccountPreferences,
): string {
  return [
    preferences.textSizeLevel,
    preferences.sonioxManualFinalizeSilenceMs,
    preferences.translationModel,
    preferences.adBannerPosition ?? '',
    preferences.speakerEnabled ? '1' : '0',
    preferences.echoAllowed ? '1' : '0',
  ].join(':')
}

export function shouldScheduleAccountPreferencesSync(args: {
  allowSync: boolean
  hydratedGeneration: number
  requestedHydrationGeneration: number
  currentPreferences: LivePhoneDemoAccountPreferences
  lastSyncedStateKey: string | null
}): boolean {
  if (!args.allowSync) return false
  if (args.hydratedGeneration !== args.requestedHydrationGeneration) return false

  return serializeAccountPreferencesSyncState(args.currentPreferences) !== args.lastSyncedStateKey
}

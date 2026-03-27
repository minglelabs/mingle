import {
  DEFAULT_SONIOX_SILENCE_MS,
  DEFAULT_TEXT_SIZE_LEVEL,
  MAX_SONIOX_SILENCE_MS,
  MIN_SONIOX_SILENCE_MS,
} from './live-phone-demo.preferences'
import {
  DEFAULT_SELECTABLE_TRANSLATION_MODEL,
  normalizeSelectableTranslationModel,
  type UserSelectableTranslationModel,
} from '@/lib/translation-models'

const MIN_TEXT_SIZE_LEVEL = 1
const MAX_TEXT_SIZE_LEVEL = 5

export type AccountPreferencesResponse = {
  textSizeLevel?: unknown
  sonioxManualFinalizeSilenceMs?: unknown
  translationModel?: unknown
}

export interface LivePhoneDemoAccountPreferences {
  textSizeLevel: number
  sonioxManualFinalizeSilenceMs: number
  translationModel: UserSelectableTranslationModel
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
  }
}

export function serializeAccountPreferencesSyncState(
  preferences: LivePhoneDemoAccountPreferences,
): string {
  return `${preferences.textSizeLevel}:${preferences.sonioxManualFinalizeSilenceMs}:${preferences.translationModel}`
}

export function shouldScheduleAccountPreferencesSync(args: {
  showAccountActions: boolean
  hydratedGeneration: number
  requestedHydrationGeneration: number
  currentPreferences: LivePhoneDemoAccountPreferences
  lastSyncedStateKey: string | null
}): boolean {
  if (!args.showAccountActions) return false
  if (args.hydratedGeneration !== args.requestedHydrationGeneration) return false

  return serializeAccountPreferencesSyncState(args.currentPreferences) !== args.lastSyncedStateKey
}

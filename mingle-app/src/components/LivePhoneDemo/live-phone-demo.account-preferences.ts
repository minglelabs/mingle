import {
  DEFAULT_INPUT_MODE,
  DEFAULT_SONIOX_SILENCE_MS,
  DEFAULT_TEXT_SIZE_LEVEL,
  MAX_SONIOX_SILENCE_MS,
  MIN_SONIOX_SILENCE_MS,
  normalizeLivePhoneDemoAdBannerPosition,
  normalizeLivePhoneDemoInputMode,
  type LivePhoneDemoAdBannerPosition,
  type LivePhoneDemoInputMode,
} from './live-phone-demo.preferences'
import {
  DEFAULT_SELECTABLE_TRANSLATION_MODEL,
  normalizeSelectableTranslationModel,
  type UserSelectableTranslationModel,
} from '@/lib/translation-models'
import {
  DEFAULT_BUBBLE_DISPLAY_MODE,
  normalizeLivePhoneDemoBubbleDisplayMode,
  type LivePhoneDemoBubbleDisplayMode,
} from './live-phone-demo.bubble-display'

const MIN_TEXT_SIZE_LEVEL = 1
const MAX_TEXT_SIZE_LEVEL = 5
export const DEFAULT_SPEAKER_ENABLED = false
export const DEFAULT_ECHO_ALLOWED = true
export const DEFAULT_AD_BANNER_POSITION: LivePhoneDemoAdBannerPosition = 'bottom'

export type AccountPreferencesResponse = {
  textSizeLevel?: unknown
  sonioxManualFinalizeSilenceMs?: unknown
  translationModel?: unknown
  adBannerPosition?: unknown
  inputMode?: unknown
  speakerEnabled?: unknown
  echoAllowed?: unknown
  bubbleDisplayMode?: unknown
}

export interface LivePhoneDemoAccountPreferences {
  textSizeLevel: number
  sonioxManualFinalizeSilenceMs: number
  translationModel: UserSelectableTranslationModel
  adBannerPosition: LivePhoneDemoAdBannerPosition | null
  inputMode: LivePhoneDemoInputMode
  speakerEnabled: boolean
  echoAllowed: boolean
  bubbleDisplayMode: LivePhoneDemoBubbleDisplayMode
}

export interface AccountPreferencesPatchBody {
  textSizeLevel: number
  sonioxManualFinalizeSilenceMs: number
  translationModel: UserSelectableTranslationModel
  adBannerPosition: LivePhoneDemoAdBannerPosition | null
  inputMode: LivePhoneDemoInputMode
  speakerEnabled: boolean
  echoAllowed: boolean
  bubbleDisplayMode: LivePhoneDemoBubbleDisplayMode
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
    adBannerPosition: normalizeLivePhoneDemoAdBannerPosition(body?.adBannerPosition) ?? DEFAULT_AD_BANNER_POSITION,
    inputMode: normalizeLivePhoneDemoInputMode(body?.inputMode) ?? DEFAULT_INPUT_MODE,
    speakerEnabled: normalizeBooleanPreference(body?.speakerEnabled, DEFAULT_SPEAKER_ENABLED),
    echoAllowed: normalizeBooleanPreference(body?.echoAllowed, DEFAULT_ECHO_ALLOWED),
    bubbleDisplayMode: normalizeLivePhoneDemoBubbleDisplayMode(body?.bubbleDisplayMode)
      || DEFAULT_BUBBLE_DISPLAY_MODE,
  }
}

export function buildAccountPreferencesPatchBody(
  preferences: LivePhoneDemoAccountPreferences,
): AccountPreferencesPatchBody {
  return {
    textSizeLevel: preferences.textSizeLevel,
    sonioxManualFinalizeSilenceMs: preferences.sonioxManualFinalizeSilenceMs,
    translationModel: preferences.translationModel,
    adBannerPosition: preferences.adBannerPosition,
    inputMode: preferences.inputMode,
    speakerEnabled: preferences.speakerEnabled,
    echoAllowed: preferences.echoAllowed,
    bubbleDisplayMode: preferences.bubbleDisplayMode,
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
    preferences.inputMode,
    preferences.speakerEnabled ? '1' : '0',
    preferences.echoAllowed ? '1' : '0',
    preferences.bubbleDisplayMode,
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

export function shouldSendTranslationModelPreference(args: {
  allowSync: boolean
  requestedHydrationGeneration: number
  successfulHydrationGeneration: number
  userSelectedSinceHydrationStart: boolean
}): boolean {
  if (!args.allowSync) return true
  if (args.userSelectedSinceHydrationStart) return true
  if (args.requestedHydrationGeneration === 0) return false

  return args.successfulHydrationGeneration === args.requestedHydrationGeneration
}

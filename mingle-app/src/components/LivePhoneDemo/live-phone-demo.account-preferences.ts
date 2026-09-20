import {
  DEFAULT_INPUT_MODE,
  DEFAULT_SONIOX_ENDPOINT_MAX_DELAY_MS,
  DEFAULT_SONIOX_ENDPOINT_TUNING_STEP,
  DEFAULT_SONIOX_SILENCE_MS,
  DEFAULT_TEXT_SIZE_LEVEL,
  MAX_SONIOX_ENDPOINT_MAX_DELAY_MS,
  MAX_SONIOX_ENDPOINT_TUNING_STEP,
  MAX_SONIOX_SILENCE_MS,
  MIN_SONIOX_ENDPOINT_MAX_DELAY_MS,
  MIN_SONIOX_ENDPOINT_TUNING_STEP,
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
export type SttSegmentationMode = 'fin' | 'end'
export const DEFAULT_STT_SEGMENTATION_MODE: SttSegmentationMode = 'end'
export const DEFAULT_STT_SEGMENTATION_PREFERENCE: SttSegmentationMode | null = null
export const DEFAULT_AD_BANNER_POSITION: LivePhoneDemoAdBannerPosition = 'bottom'
export const ACCOUNT_PREFERENCES_SYNC_RETRY_BASE_MS = 2_000
export const ACCOUNT_PREFERENCES_SYNC_RETRY_MAX_MS = 60_000

export type AccountPreferencesResponse = {
  textSizeLevel?: unknown
  sonioxManualFinalizeSilenceMs?: unknown
  sonioxEndpointMaxDelayMs?: unknown
  sonioxEndpointTuningStep?: unknown
  translationModel?: unknown
  adBannerPosition?: unknown
  inputMode?: unknown
  speakerEnabled?: unknown
  echoAllowed?: unknown
  bubbleDisplayMode?: unknown
  sttSegmentationMode?: unknown
}

export interface LivePhoneDemoAccountPreferences {
  textSizeLevel: number
  sonioxManualFinalizeSilenceMs: number
  sonioxEndpointMaxDelayMs: number
  sonioxEndpointTuningStep: number
  translationModel: UserSelectableTranslationModel
  adBannerPosition: LivePhoneDemoAdBannerPosition | null
  inputMode: LivePhoneDemoInputMode
  speakerEnabled: boolean
  echoAllowed: boolean
  bubbleDisplayMode: LivePhoneDemoBubbleDisplayMode
  sttSegmentationMode: SttSegmentationMode | null
}

export interface AccountPreferencesPatchBody {
  textSizeLevel: number
  sonioxManualFinalizeSilenceMs: number
  sonioxEndpointMaxDelayMs: number
  sonioxEndpointTuningStep: number
  translationModel: UserSelectableTranslationModel
  adBannerPosition: LivePhoneDemoAdBannerPosition | null
  inputMode: LivePhoneDemoInputMode
  speakerEnabled: boolean
  echoAllowed: boolean
  bubbleDisplayMode: LivePhoneDemoBubbleDisplayMode
  sttSegmentationMode: SttSegmentationMode | null
}

const ACCOUNT_PREFERENCES_CACHE_KEY_PREFIX = 'mingle:account-preferences:v1'
const ACCOUNT_PREFERENCES_CACHE_MAX_STALE_AGE_MS = 90 * 24 * 60 * 60 * 1000

export type AccountPreferencesCacheIdentity = {
  apiNamespace: string
  userId?: string | null
  trackingUserId?: string | null
}

export type AccountPreferencesCacheSnapshot = {
  savedAt: number
  preferences: LivePhoneDemoAccountPreferences
  pendingSync: boolean
}

const accountPreferencesMemoryCache = new Map<string, AccountPreferencesCacheSnapshot>()
const accountPreferencesListeners = new Map<string, Set<() => void>>()
const accountPreferencesFlushes = new Map<string, Promise<void>>()

export function subscribeAccountPreferences(identity: AccountPreferencesCacheIdentity, listener: () => void): () => void {
  const key = buildAccountPreferencesCacheKey(identity)
  const listeners = accountPreferencesListeners.get(key) ?? new Set<() => void>()
  listeners.add(listener)
  accountPreferencesListeners.set(key, listeners)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) accountPreferencesListeners.delete(key)
  }
}

// Callers may have a stale room snapshot. Apply only the fields the user
// actually changed to the account's latest snapshot, never the whole room.
export function commitAccountPreferencesEdit(
  identity: AccountPreferencesCacheIdentity,
  previous: LivePhoneDemoAccountPreferences,
  next: LivePhoneDemoAccountPreferences,
  isLegacyNamespace: boolean,
): LivePhoneDemoAccountPreferences {
  const cached = readCachedAccountPreferencesSnapshot(identity, isLegacyNamespace)
  const merged = { ...(cached?.preferences ?? previous) }
  let changed = false
  for (const key of Object.keys(next) as (keyof LivePhoneDemoAccountPreferences)[]) {
    if (Object.is(previous[key], next[key])) continue
    Object.assign(merged, { [key]: next[key] })
    changed = true
  }
  if (changed) writeCachedAccountPreferences(identity, merged, { pendingSync: true })
  return merged
}

// One writer per account/namespace, shared by visible and background rooms.
// Retries always read the durable latest intent, not the initiating room's ref.
export function flushCachedAccountPreferences(input: {
  identity: AccountPreferencesCacheIdentity
  isLegacyNamespace: boolean
  send: (preferences: LivePhoneDemoAccountPreferences) => Promise<void>
}): Promise<void> {
  const key = buildAccountPreferencesCacheKey(input.identity)
  const active = accountPreferencesFlushes.get(key)
  if (active) return active
  const promise = Promise.resolve().then(async () => {
    while (true) {
      const snapshot = readCachedAccountPreferencesSnapshot(input.identity, input.isLegacyNamespace)
      if (!snapshot?.pendingSync) return
      await input.send(snapshot.preferences)
      const current = readCachedAccountPreferencesSnapshot(input.identity, input.isLegacyNamespace)
      if (!current) return
      if (current.savedAt !== snapshot.savedAt) continue
      writeCachedAccountPreferences(input.identity, current.preferences, { pendingSync: false })
      return
    }
  }).finally(() => {
    accountPreferencesFlushes.delete(key)
  })
  accountPreferencesFlushes.set(key, promise)
  return promise
}

export function reconcileAccountPreferencesHydration(input: {
  identity: AccountPreferencesCacheIdentity
  preferences: LivePhoneDemoAccountPreferences
  startedSavedAt: number | null
  isLegacyNamespace: boolean
}): AccountPreferencesCacheSnapshot {
  const current = readCachedAccountPreferencesSnapshot(input.identity, input.isLegacyNamespace)
  if (current && (current.pendingSync || current.savedAt !== input.startedSavedAt)) return current
  writeCachedAccountPreferences(input.identity, input.preferences, { pendingSync: false })
  return readCachedAccountPreferencesSnapshot(input.identity, input.isLegacyNamespace)!
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

function normalizeNonNegativeIntegerPreference(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < min) {
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

export function normalizeSonioxEndpointMaxDelayPreference(value: unknown): number {
  return normalizeIntegerPreference(
    value,
    DEFAULT_SONIOX_ENDPOINT_MAX_DELAY_MS,
    MIN_SONIOX_ENDPOINT_MAX_DELAY_MS,
    MAX_SONIOX_ENDPOINT_MAX_DELAY_MS,
  )
}

export function normalizeSonioxEndpointTuningStepPreference(value: unknown): number {
  return normalizeNonNegativeIntegerPreference(
    value,
    DEFAULT_SONIOX_ENDPOINT_TUNING_STEP,
    MIN_SONIOX_ENDPOINT_TUNING_STEP,
    MAX_SONIOX_ENDPOINT_TUNING_STEP,
  )
}

function normalizeBooleanPreference(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function normalizeSttSegmentationMode(value: unknown): SttSegmentationMode | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  return normalized === 'fin' || normalized === 'end' ? normalized : null
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
    sonioxEndpointMaxDelayMs: isLegacySonioxSilenceSliderNamespace
      ? DEFAULT_SONIOX_ENDPOINT_MAX_DELAY_MS
      : normalizeSonioxEndpointMaxDelayPreference(body?.sonioxEndpointMaxDelayMs),
    sonioxEndpointTuningStep: isLegacySonioxSilenceSliderNamespace
      ? DEFAULT_SONIOX_ENDPOINT_TUNING_STEP
      : normalizeSonioxEndpointTuningStepPreference(body?.sonioxEndpointTuningStep),
    translationModel: normalizeSelectableTranslationModel(body?.translationModel) || DEFAULT_SELECTABLE_TRANSLATION_MODEL,
    adBannerPosition: normalizeLivePhoneDemoAdBannerPosition(body?.adBannerPosition) ?? DEFAULT_AD_BANNER_POSITION,
    inputMode: normalizeLivePhoneDemoInputMode(body?.inputMode) ?? DEFAULT_INPUT_MODE,
    speakerEnabled: normalizeBooleanPreference(body?.speakerEnabled, DEFAULT_SPEAKER_ENABLED),
    echoAllowed: normalizeBooleanPreference(body?.echoAllowed, DEFAULT_ECHO_ALLOWED),
    bubbleDisplayMode: normalizeLivePhoneDemoBubbleDisplayMode(body?.bubbleDisplayMode)
      || DEFAULT_BUBBLE_DISPLAY_MODE,
    sttSegmentationMode: normalizeSttSegmentationMode(body?.sttSegmentationMode) ?? DEFAULT_STT_SEGMENTATION_PREFERENCE,
  }
}

function buildAccountPreferencesCacheKey(identity: AccountPreferencesCacheIdentity): string {
  const namespace = identity.apiNamespace.trim() || 'default'
  const userId = identity.userId?.trim()
  const trackingUserId = identity.trackingUserId?.trim()
  const owner = userId
    ? `user:${userId}`
    : `tracking:${trackingUserId || 'anonymous'}`

  return `${ACCOUNT_PREFERENCES_CACHE_KEY_PREFIX}:${encodeURIComponent(namespace)}:${encodeURIComponent(owner)}`
}

function normalizeAccountPreferencesCacheRecord(
  value: unknown,
  isLegacySonioxSilenceSliderNamespace: boolean,
  now = Date.now(),
): AccountPreferencesCacheSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const candidate = value as Partial<AccountPreferencesCacheSnapshot>
  if (
    typeof candidate.savedAt !== 'number'
    || !Number.isFinite(candidate.savedAt)
    || candidate.savedAt > now + 60_000
    || now - candidate.savedAt > ACCOUNT_PREFERENCES_CACHE_MAX_STALE_AGE_MS
    || !candidate.preferences
    || typeof candidate.preferences !== 'object'
    || Array.isArray(candidate.preferences)
  ) {
    return null
  }

  return {
    savedAt: candidate.savedAt,
    pendingSync: candidate.pendingSync === true,
    preferences: buildHydratedAccountPreferences(
      candidate.preferences,
      isLegacySonioxSilenceSliderNamespace,
    ),
  }
}

export function readCachedAccountPreferencesSnapshot(
  identity: AccountPreferencesCacheIdentity,
  isLegacySonioxSilenceSliderNamespace: boolean,
): AccountPreferencesCacheSnapshot | null {
  if (typeof window === 'undefined') return null

  const storageKey = buildAccountPreferencesCacheKey(identity)
  const memoryRecord = normalizeAccountPreferencesCacheRecord(
    accountPreferencesMemoryCache.get(storageKey),
    isLegacySonioxSilenceSliderNamespace,
  )
  if (memoryRecord) return memoryRecord

  accountPreferencesMemoryCache.delete(storageKey)

  try {
    const rawValue = window.localStorage.getItem(storageKey)
    if (!rawValue) return null

    const storedRecord = normalizeAccountPreferencesCacheRecord(
      JSON.parse(rawValue),
      isLegacySonioxSilenceSliderNamespace,
    )
    if (!storedRecord) {
      window.localStorage.removeItem(storageKey)
      return null
    }

    accountPreferencesMemoryCache.set(storageKey, storedRecord)
    return storedRecord
  } catch {
    return null
  }
}

export function readCachedAccountPreferences(
  identity: AccountPreferencesCacheIdentity,
  isLegacySonioxSilenceSliderNamespace: boolean,
): LivePhoneDemoAccountPreferences | null {
  return readCachedAccountPreferencesSnapshot(
    identity,
    isLegacySonioxSilenceSliderNamespace,
  )?.preferences ?? null
}

export function writeCachedAccountPreferences(
  identity: AccountPreferencesCacheIdentity,
  preferences: LivePhoneDemoAccountPreferences,
  options?: { pendingSync?: boolean },
): void {
  if (typeof window === 'undefined') return

  const storageKey = buildAccountPreferencesCacheKey(identity)
  const previousRecord = accountPreferencesMemoryCache.get(storageKey)
  const record: AccountPreferencesCacheSnapshot = {
    savedAt: Math.max(Date.now(), (previousRecord?.savedAt ?? 0) + 1),
    preferences,
    pendingSync: options?.pendingSync ?? previousRecord?.pendingSync ?? false,
  }
  accountPreferencesMemoryCache.set(storageKey, record)

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(record))
  } catch {
    // The process-wide cache still keeps room switches local-first.
  }
  accountPreferencesListeners.get(storageKey)?.forEach((listener) => listener())
}

export function shouldApplyAccountPreferencesHydration(args: {
  hydrationStartedAtLocalRevision: number
  currentLocalRevision: number
}): boolean {
  return args.hydrationStartedAtLocalRevision === args.currentLocalRevision
}

export function buildAccountPreferencesPatchBody(
  preferences: LivePhoneDemoAccountPreferences,
): AccountPreferencesPatchBody {
  return {
    textSizeLevel: preferences.textSizeLevel,
    sonioxManualFinalizeSilenceMs: preferences.sonioxManualFinalizeSilenceMs,
    sonioxEndpointMaxDelayMs: preferences.sonioxEndpointMaxDelayMs,
    sonioxEndpointTuningStep: preferences.sonioxEndpointTuningStep,
    translationModel: preferences.translationModel,
    adBannerPosition: preferences.adBannerPosition,
    inputMode: preferences.inputMode,
    speakerEnabled: preferences.speakerEnabled,
    echoAllowed: preferences.echoAllowed,
    bubbleDisplayMode: preferences.bubbleDisplayMode,
    sttSegmentationMode: preferences.sttSegmentationMode,
  }
}

export function serializeAccountPreferencesSyncState(
  preferences: LivePhoneDemoAccountPreferences,
): string {
  return [
    preferences.textSizeLevel,
    preferences.sonioxManualFinalizeSilenceMs,
    preferences.sonioxEndpointMaxDelayMs,
    preferences.sonioxEndpointTuningStep,
    preferences.translationModel,
    preferences.adBannerPosition ?? '',
    preferences.inputMode,
    preferences.speakerEnabled ? '1' : '0',
    preferences.echoAllowed ? '1' : '0',
    preferences.bubbleDisplayMode,
    preferences.sttSegmentationMode ?? '',
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

export function resolveAccountPreferencesSyncRetryDelayMs(attemptCount: number): number {
  return Math.min(
    ACCOUNT_PREFERENCES_SYNC_RETRY_MAX_MS,
    ACCOUNT_PREFERENCES_SYNC_RETRY_BASE_MS * (2 ** Math.max(0, attemptCount - 1)),
  )
}

export function shouldRetryAccountPreferencesSync(args: {
  allowSync: boolean
  pendingSync: boolean
  mounted: boolean
}): boolean {
  return args.allowSync && args.pendingSync && args.mounted
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

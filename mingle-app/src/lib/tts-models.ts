// Single source of truth for user-selectable TTS models.
// Shared by the server (tts-provider, handlers, account preferences) and the client.

export type TtsProviderId = 'gemini' | 'soniox'

export type UserSelectableTtsModel =
  | 'soniox-tts-rt-v2'
  | 'gemini-3.8-flash-lite-tts'
  | 'gemini-3.8-flash-tts'

export type GeminiTtsModel = Exclude<UserSelectableTtsModel, 'soniox-tts-rt-v2'>

export type TtsModelOption = {
  value: UserSelectableTtsModel
  label: string
}

export type TtsRuntimeSelection = {
  value: UserSelectableTtsModel
  provider: TtsProviderId
  runtimeModel: string
}

// Default for users who never picked a model (app_users.tts_model is NULL).
// A stored value that is no longer offered (the removed `inworld-tts-1.5-mini`)
// resolves here too.
export const DEFAULT_SELECTABLE_TTS_MODEL: UserSelectableTtsModel = 'soniox-tts-rt-v2'

// The default comes first: the settings row falls back to the first option.
export const TTS_MODEL_OPTIONS: TtsModelOption[] = [
  { value: 'soniox-tts-rt-v2', label: 'soniox-tts-rt-v2' },
  { value: 'gemini-3.8-flash-lite-tts', label: 'gemini-3.8-flash-lite-tts' },
  { value: 'gemini-3.8-flash-tts', label: 'gemini-3.8-flash-tts' },
]

const TTS_MODEL_RUNTIME: Record<UserSelectableTtsModel, { provider: TtsProviderId, runtimeModel: string }> = {
  'soniox-tts-rt-v2': { provider: 'soniox', runtimeModel: 'tts-rt-v2' },
  'gemini-3.8-flash-lite-tts': { provider: 'gemini', runtimeModel: 'gemini-3.8-flash-lite-tts' },
  'gemini-3.8-flash-tts': { provider: 'gemini', runtimeModel: 'gemini-3.8-flash-tts' },
}

/** When a Gemini synthesis fails, it is retried once with the other Gemini model. */
const GEMINI_FALLBACK_MODELS: Record<GeminiTtsModel, GeminiTtsModel> = {
  'gemini-3.8-flash-lite-tts': 'gemini-3.8-flash-tts',
  'gemini-3.8-flash-tts': 'gemini-3.8-flash-lite-tts',
}

export function normalizeSelectableTtsModel(value: unknown): UserSelectableTtsModel | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  if (!normalized) return null
  return Object.prototype.hasOwnProperty.call(TTS_MODEL_RUNTIME, normalized)
    ? normalized as UserSelectableTtsModel
    : null
}

/** Missing or invalid values resolve to the default (soniox-tts-rt-v2). */
export function resolveTtsRuntimeSelection(value: unknown): TtsRuntimeSelection {
  const selected = normalizeSelectableTtsModel(value) ?? DEFAULT_SELECTABLE_TTS_MODEL
  return { value: selected, ...TTS_MODEL_RUNTIME[selected] }
}

/**
 * The Gemini model that speaks for `model` when Gemini has to: a whole clip
 * (Soniox speaks at reading pace, so a whole clip would arrive only after the
 * full playback time), or a Soniox stream that failed before any audio.
 */
export function getGeminiTtsModel(model: UserSelectableTtsModel): GeminiTtsModel {
  return model === 'soniox-tts-rt-v2' ? 'gemini-3.8-flash-lite-tts' : model
}

/** The model a failed Gemini synthesis with `model` is retried with. */
export function getFallbackTtsModel(model: GeminiTtsModel): GeminiTtsModel {
  return GEMINI_FALLBACK_MODELS[model]
}

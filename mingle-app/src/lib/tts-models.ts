// Single source of truth for user-selectable TTS models.
// Shared by the server (tts-provider, handlers, account preferences) and the client.

export type TtsProviderId = 'gemini'

export type UserSelectableTtsModel =
  | 'gemini-3.8-flash-lite-tts'
  | 'gemini-3.8-flash-tts'

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
export const DEFAULT_SELECTABLE_TTS_MODEL: UserSelectableTtsModel = 'gemini-3.8-flash-lite-tts'

// The default comes first: the settings row falls back to the first option.
export const TTS_MODEL_OPTIONS: TtsModelOption[] = [
  { value: 'gemini-3.8-flash-lite-tts', label: 'gemini-3.8-flash-lite-tts' },
  { value: 'gemini-3.8-flash-tts', label: 'gemini-3.8-flash-tts' },
]

const TTS_MODEL_PROVIDERS: Record<UserSelectableTtsModel, TtsProviderId> = {
  'gemini-3.8-flash-lite-tts': 'gemini',
  'gemini-3.8-flash-tts': 'gemini',
}

/** When a synthesis fails, it is retried once with the other Gemini model. */
const TTS_FALLBACK_MODELS: Record<UserSelectableTtsModel, UserSelectableTtsModel> = {
  'gemini-3.8-flash-lite-tts': 'gemini-3.8-flash-tts',
  'gemini-3.8-flash-tts': 'gemini-3.8-flash-lite-tts',
}

export function normalizeSelectableTtsModel(value: unknown): UserSelectableTtsModel | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  if (!normalized) return null
  return Object.prototype.hasOwnProperty.call(TTS_MODEL_PROVIDERS, normalized)
    ? normalized as UserSelectableTtsModel
    : null
}

/** Missing or invalid values resolve to the default (gemini-3.8-flash-lite-tts). */
export function resolveTtsRuntimeSelection(value: unknown): TtsRuntimeSelection {
  const selected = normalizeSelectableTtsModel(value) ?? DEFAULT_SELECTABLE_TTS_MODEL
  return {
    value: selected,
    provider: TTS_MODEL_PROVIDERS[selected],
    runtimeModel: selected,
  }
}

/** The model a failed synthesis with `model` is retried with. */
export function getFallbackTtsModel(model: UserSelectableTtsModel): UserSelectableTtsModel {
  return TTS_FALLBACK_MODELS[model]
}

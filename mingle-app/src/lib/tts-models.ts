// Single source of truth for user-selectable TTS models.
// Shared by the server (tts-provider, handlers, account preferences) and the client.

export type TtsProviderId = 'inworld' | 'gemini'

export type UserSelectableTtsModel =
  | 'inworld-tts-1.5-mini'
  | 'gemini-3.8-flash-tts'
  | 'gemini-3.8-flash-lite-tts'

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
// Inworld remains the automatic fallback when a Gemini synthesis fails.
export const DEFAULT_SELECTABLE_TTS_MODEL: UserSelectableTtsModel = 'gemini-3.8-flash-lite-tts'

export const TTS_MODEL_OPTIONS: TtsModelOption[] = [
  { value: 'inworld-tts-1.5-mini', label: 'inworld-tts-1.5-mini' },
  { value: 'gemini-3.8-flash-tts', label: 'gemini-3.8-flash-tts' },
  { value: 'gemini-3.8-flash-lite-tts', label: 'gemini-3.8-flash-lite-tts' },
]

const TTS_MODEL_PROVIDERS: Record<UserSelectableTtsModel, TtsProviderId> = {
  'inworld-tts-1.5-mini': 'inworld',
  'gemini-3.8-flash-tts': 'gemini',
  'gemini-3.8-flash-lite-tts': 'gemini',
}

/** Inworld runtime model id. Env override keeps the existing production behavior. */
export function getInworldTtsModelId(): string {
  return process.env.INWORLD_TTS_MODEL_ID || 'inworld-tts-1.5-mini'
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
  const provider = TTS_MODEL_PROVIDERS[selected]
  return {
    value: selected,
    provider,
    runtimeModel: provider === 'inworld' ? getInworldTtsModelId() : selected,
  }
}

export type TranslationEngineProvider = 'gemini' | 'openai' | 'claude'

export type TranslationInfrastructureProvider = 'google' | 'openai' | 'anthropic'

export type UserSelectableTranslationModel =
  | 'gemini-2.5-flash-lite'
  | 'gpt-6-luna'
  | 'claude-haiku-5-5'

export type TranslationModelBadge = 'Best' | 'Slow'

export type TranslationModelOption = {
  value: UserSelectableTranslationModel
  label: string
  badge?: TranslationModelBadge
}

export type TranslationRuntimeSelection = {
  value: UserSelectableTranslationModel
  engineProvider: TranslationEngineProvider
  infrastructureProvider: TranslationInfrastructureProvider
  runtimeModel: string
  baseUrl?: string
}

// Fallback for users whose stored preference is unset (app_users.translation_model is NULL).
export const DEFAULT_SELECTABLE_TRANSLATION_MODEL: UserSelectableTranslationModel = 'claude-haiku-5-5'
// Written to the account at creation.
export const NEW_REGISTERED_USER_TRANSLATION_MODEL: UserSelectableTranslationModel = 'claude-haiku-5-5'

export const TRANSLATION_MODEL_OPTIONS: TranslationModelOption[] = [
  {
    value: 'gemini-2.5-flash-lite',
    label: 'gemini-2.5-flash-lite',
  },
  {
    value: 'gpt-6-luna',
    label: 'gpt-6-luna',
    badge: 'Best',
  },
  {
    value: 'claude-haiku-5-5',
    label: 'claude-haiku-5-5',
  },
]

const TRANSLATION_RUNTIME_SELECTIONS: Record<UserSelectableTranslationModel, TranslationRuntimeSelection> = {
  'gemini-2.5-flash-lite': {
    value: 'gemini-2.5-flash-lite',
    engineProvider: 'gemini',
    infrastructureProvider: 'google',
    runtimeModel: 'gemini-2.5-flash-lite',
  },
  'gpt-6-luna': {
    value: 'gpt-6-luna',
    engineProvider: 'openai',
    infrastructureProvider: 'openai',
    runtimeModel: 'gpt-6-luna',
    baseUrl: 'https://api.openai.com/v1',
  },
  'claude-haiku-5-5': {
    value: 'claude-haiku-5-5',
    engineProvider: 'claude',
    infrastructureProvider: 'anthropic',
    runtimeModel: 'claude-haiku-5-5',
  },
}

function canonicalizeTranslationModel(rawValue: string): UserSelectableTranslationModel | null {
  const normalized = rawValue.trim().toLowerCase()
  if (!normalized) return null

  if (normalized === 'gemini-2.5-flash-lite') return 'gemini-2.5-flash-lite'

  if (
    normalized === 'gpt-6-luna'
    || normalized === 'gpt 6 luna'
    || normalized === 'models/gpt-6-luna'
    || normalized === 'openai/gpt-6-luna'
  ) {
    return 'gpt-6-luna'
  }

  if (
    normalized === 'claude-haiku-5-5'
    || normalized === 'claude haiku 5.5'
    || normalized === 'anthropic/claude-haiku-5-5'
  ) {
    return 'claude-haiku-5-5'
  }

  return null
}

export function normalizeSelectableTranslationModel(value: unknown): UserSelectableTranslationModel | null {
  if (typeof value !== 'string') return null
  return canonicalizeTranslationModel(value)
}

export function resolveTranslationRuntimeSelection(value: unknown): TranslationRuntimeSelection | null {
  const normalized = normalizeSelectableTranslationModel(value)
  if (!normalized) return null
  return TRANSLATION_RUNTIME_SELECTIONS[normalized]
}

export function resolveDefaultSelectableTranslationModel(): UserSelectableTranslationModel {
  return DEFAULT_SELECTABLE_TRANSLATION_MODEL
}

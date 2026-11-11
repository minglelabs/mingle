export type TranslationEngineProvider = 'gemini' | 'openai' | 'claude'

export type TranslationInfrastructureProvider = 'google' | 'openai' | 'anthropic'

export type UserSelectableTranslationModel =
  | 'gpt-6-luna'
  | 'claude-haiku-5-5'

/**
 * Models users could pick before; they are no longer offered and run on GPT-6 Luna.
 * Kept so the admin dashboard can still count the messages they translated.
 */
export const RETIRED_TRANSLATION_MODELS = ['gemini-2.5-flash-lite'] as const
export type RetiredTranslationModel = typeof RETIRED_TRANSLATION_MODELS[number]

/** A recorded translation_model value that names a retired model, else null. */
export function normalizeRetiredTranslationModel(value: unknown): RetiredTranslationModel | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  return RETIRED_TRANSLATION_MODELS.find((model) => model === normalized) ?? null
}

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
export const DEFAULT_SELECTABLE_TRANSLATION_MODEL: UserSelectableTranslationModel = 'gpt-6-luna'
// Written to the account at creation.
export const NEW_REGISTERED_USER_TRANSLATION_MODEL: UserSelectableTranslationModel = 'gpt-6-luna'

export const TRANSLATION_MODEL_OPTIONS: TranslationModelOption[] = [
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

  if (
    normalized === 'gpt-6-luna'
    // Retired option: accounts that stored it now run on GPT-6 Luna.
    || normalized === 'gemini-2.5-flash-lite'
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

export type TranslationEngineProvider = 'gemini' | 'gemma' | 'qwen'

export type TranslationInfrastructureProvider = 'google' | 'openrouter'

export type UserSelectableTranslationModel =
  | 'gemini-2.5-flash-lite'
  | 'gemma-4-31b-it'
  | 'google/gemma-4-31b-it'
  | 'qwen/qwen3.5-9b'
  | 'qwen/qwen3.6-plus'

export type TranslationModelOption = {
  value: UserSelectableTranslationModel
  label: string
}

export type TranslationRuntimeSelection = {
  value: UserSelectableTranslationModel
  engineProvider: TranslationEngineProvider
  infrastructureProvider: TranslationInfrastructureProvider
  runtimeModel: string
  baseUrl?: string
}

export const DEFAULT_SELECTABLE_TRANSLATION_MODEL: UserSelectableTranslationModel = 'gemini-2.5-flash-lite'

export const TRANSLATION_MODEL_OPTIONS: TranslationModelOption[] = [
  {
    value: 'gemini-2.5-flash-lite',
    label: 'gemini-2.5-flash-lite',
  },
  {
    value: 'gemma-4-31b-it',
    label: 'gemma-4-31b-it',
  },
  {
    value: 'google/gemma-4-31b-it',
    label: 'gemma-4-31b-it (OpenRouter)',
  },
  {
    value: 'qwen/qwen3.5-9b',
    label: 'qwen3.5-9b',
  },
  {
    value: 'qwen/qwen3.6-plus',
    label: 'qwen3.6-plus',
  },
]

const TRANSLATION_RUNTIME_SELECTIONS: Record<UserSelectableTranslationModel, TranslationRuntimeSelection> = {
  'gemini-2.5-flash-lite': {
    value: 'gemini-2.5-flash-lite',
    engineProvider: 'gemini',
    infrastructureProvider: 'google',
    runtimeModel: 'gemini-2.5-flash-lite',
  },
  'gemma-4-31b-it': {
    value: 'gemma-4-31b-it',
    engineProvider: 'gemma',
    infrastructureProvider: 'google',
    runtimeModel: 'gemma-4-31b-it',
  },
  'google/gemma-4-31b-it': {
    value: 'google/gemma-4-31b-it',
    engineProvider: 'gemma',
    infrastructureProvider: 'openrouter',
    runtimeModel: 'google/gemma-4-31b-it',
    baseUrl: 'https://openrouter.ai/api/v1',
  },
  'qwen/qwen3.5-9b': {
    value: 'qwen/qwen3.5-9b',
    engineProvider: 'qwen',
    infrastructureProvider: 'openrouter',
    runtimeModel: 'qwen/qwen3.5-9b',
    baseUrl: 'https://openrouter.ai/api/v1',
  },
  'qwen/qwen3.6-plus': {
    value: 'qwen/qwen3.6-plus',
    engineProvider: 'qwen',
    infrastructureProvider: 'openrouter',
    runtimeModel: 'qwen/qwen3.6-plus:free',
    baseUrl: 'https://openrouter.ai/api/v1',
  },
}

function canonicalizeTranslationModel(rawValue: string): UserSelectableTranslationModel | null {
  const normalized = rawValue.trim().toLowerCase()
  if (!normalized) return null

  if (normalized === 'gemini-2.5-flash-lite') return 'gemini-2.5-flash-lite'

  if (
    normalized === 'gemma-4-31b-it'
    || normalized === 'gemma-4-31b'
    || normalized === 'gemma 4 31b'
    || normalized === 'gemma 4 31b it'
    || normalized === 'models/gemma-4-31b-it'
  ) {
    return 'gemma-4-31b-it'
  }

  if (
    normalized === 'google/gemma-4-31b-it'
    || normalized === 'gemma-4-31b-it (openrouter)'
    || normalized === 'gemma 4 31b openrouter'
    || normalized === 'google gemma 4 31b'
  ) {
    return 'google/gemma-4-31b-it'
  }

  if (
    normalized === 'qwen/qwen3.5-9b'
    || normalized === 'qwen3.5-9b'
    || normalized === 'qwen3.5-9b-20260310'
    || normalized === 'qwen/qwen3.5-9b-20260310'
    || normalized === 'qwen/qwen3.5-9b:free'
    || normalized === 'qwen/qwen3.5-9b-20260310:free'
    || normalized === 'qwen/qwen3.5-9b-free'
    || normalized === 'qwen/qwen3.5-9b-20260310-free'
    || normalized === 'qwen/qwen3.5-9b (openrouter)'
    || normalized === 'qwen/qwen3.5-9b (venice)'
  ) {
    return 'qwen/qwen3.5-9b'
  }

  if (normalized === 'qwen/qwen3.5-9b') return 'qwen/qwen3.5-9b'

  if (
    normalized === 'qwen/qwen3.6-plus'
    || normalized === 'qwen3.6-plus'
    || normalized === 'qwen/qwen3.6-plus:free'
    || normalized === 'qwen/qwen3.6-plus-free'
    || normalized === 'qwen/qwen3.6-plus (openrouter)'
  ) {
    return 'qwen/qwen3.6-plus'
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

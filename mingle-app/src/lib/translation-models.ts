export type TranslationEngineProvider = 'gemini' | 'qwen'

export type TranslationInfrastructureProvider = 'google' | 'openrouter'

export type UserSelectableTranslationModel =
  | 'gemini-2.5-flash-lite'
  | 'qwen/qwen3.5-9b'

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
    value: 'qwen/qwen3.5-9b',
    label: 'qwen/qwen3.5-9b',
  },
]

const TRANSLATION_RUNTIME_SELECTIONS: Record<UserSelectableTranslationModel, TranslationRuntimeSelection> = {
  'gemini-2.5-flash-lite': {
    value: 'gemini-2.5-flash-lite',
    engineProvider: 'gemini',
    infrastructureProvider: 'google',
    runtimeModel: 'gemini-2.5-flash-lite',
  },
  'qwen/qwen3.5-9b': {
    value: 'qwen/qwen3.5-9b',
    engineProvider: 'qwen',
    infrastructureProvider: 'openrouter',
    runtimeModel: 'qwen/qwen3.5-9b',
    baseUrl: 'https://openrouter.ai/api/v1',
  },
}

function canonicalizeTranslationModel(rawValue: string): UserSelectableTranslationModel | null {
  const normalized = rawValue.trim().toLowerCase()
  if (!normalized) return null

  if (normalized === 'gemini-2.5-flash-lite') return 'gemini-2.5-flash-lite'

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

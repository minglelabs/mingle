export type TranslationEngineProvider = 'gemini' | 'qwen'

export type TranslationInfrastructureProvider = 'google' | 'openrouter' | 'qwencloud'

export type UserSelectableTranslationModel =
  | 'gemini-2.5-flash-lite'
  | 'qwen/qwen3.7-flash'

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

export const DEFAULT_SELECTABLE_TRANSLATION_MODEL: UserSelectableTranslationModel = 'gemini-2.5-flash-lite'

export const TRANSLATION_MODEL_OPTIONS: TranslationModelOption[] = [
  {
    value: 'gemini-2.5-flash-lite',
    label: 'gemini-2.5-flash-lite',
    badge: 'Best',
  },
  {
    value: 'qwen/qwen3.7-flash',
    label: 'qwen3.7-flash',
    badge: 'Slow',
  },
]

const TRANSLATION_RUNTIME_SELECTIONS: Record<UserSelectableTranslationModel, TranslationRuntimeSelection> = {
  'gemini-2.5-flash-lite': {
    value: 'gemini-2.5-flash-lite',
    engineProvider: 'gemini',
    infrastructureProvider: 'google',
    runtimeModel: 'gemini-2.5-flash-lite',
  },
  'qwen/qwen3.7-flash': {
    value: 'qwen/qwen3.7-flash',
    engineProvider: 'qwen',
    infrastructureProvider: 'qwencloud',
    runtimeModel: 'qwen3.7-flash',
    baseUrl: 'https://dashscope-us.aliyuncs.com/compatible-mode/v1',
  },
}

function canonicalizeTranslationModel(rawValue: string): UserSelectableTranslationModel | null {
  const normalized = rawValue.trim().toLowerCase()
  if (!normalized) return null

  if (normalized === 'gemini-2.5-flash-lite') return 'gemini-2.5-flash-lite'

  if (
    normalized === 'qwen/qwen3.7-flash'
    || normalized === 'qwen3.7-flash'
    || normalized === 'qwen/qwen3.7-flash (openrouter)'
  ) {
    return 'qwen/qwen3.7-flash'
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

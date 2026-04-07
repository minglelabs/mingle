import { describe, expect, it } from 'vitest'
import {
  TRANSLATION_MODEL_OPTIONS,
  normalizeSelectableTranslationModel,
  resolveTranslationRuntimeSelection,
} from './translation-models'

describe('translation model catalog', () => {
  it('includes the new Qwen 3.6 Plus and both Gemma 4 options', () => {
    expect(TRANSLATION_MODEL_OPTIONS).toEqual(expect.arrayContaining([
      {
        value: 'qwen/qwen3.6-plus',
        label: 'qwen3.6-plus',
      },
      {
        value: 'gemma-4-31b-it',
        label: 'gemma-4-31b-it',
      },
      {
        value: 'google/gemma-4-31b-it',
        label: 'gemma-4-31b-it (OpenRouter)',
      },
    ]))
  })

  it('normalizes OpenRouter Qwen 3.6 Plus aliases', () => {
    expect(normalizeSelectableTranslationModel('qwen/qwen3.6-plus')).toBe('qwen/qwen3.6-plus')
    expect(normalizeSelectableTranslationModel('qwen3.6-plus')).toBe('qwen/qwen3.6-plus')
    expect(normalizeSelectableTranslationModel('qwen/qwen3.6-plus:free')).toBe('qwen/qwen3.6-plus')
  })

  it('normalizes Gemma 4 aliases', () => {
    expect(normalizeSelectableTranslationModel('gemma-4-31b-it')).toBe('gemma-4-31b-it')
    expect(normalizeSelectableTranslationModel('models/gemma-4-31b-it')).toBe('gemma-4-31b-it')
    expect(normalizeSelectableTranslationModel('gemma 4 31b')).toBe('gemma-4-31b-it')
    expect(normalizeSelectableTranslationModel('google/gemma-4-31b-it')).toBe('google/gemma-4-31b-it')
    expect(normalizeSelectableTranslationModel('gemma-4-31b-it (openrouter)')).toBe('google/gemma-4-31b-it')
  })

  it('resolves runtime selections for the new models', () => {
    expect(resolveTranslationRuntimeSelection('qwen/qwen3.6-plus')).toMatchObject({
      engineProvider: 'qwen',
      infrastructureProvider: 'openrouter',
      runtimeModel: 'qwen/qwen3.6-plus:free',
      baseUrl: 'https://openrouter.ai/api/v1',
    })

    expect(resolveTranslationRuntimeSelection('gemma-4-31b-it')).toMatchObject({
      engineProvider: 'gemma',
      infrastructureProvider: 'google',
      runtimeModel: 'gemma-4-31b-it',
    })

    expect(resolveTranslationRuntimeSelection('google/gemma-4-31b-it')).toMatchObject({
      engineProvider: 'gemma',
      infrastructureProvider: 'openrouter',
      runtimeModel: 'google/gemma-4-31b-it',
      baseUrl: 'https://openrouter.ai/api/v1',
    })
  })
})

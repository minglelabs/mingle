import { describe, expect, it } from 'vitest'
import {
  TRANSLATION_MODEL_OPTIONS,
  normalizeSelectableTranslationModel,
  resolveTranslationRuntimeSelection,
} from './translation-models'

describe('translation model catalog', () => {
  it('keeps closed-state labels compact while exposing open-menu badges as metadata', () => {
    expect(TRANSLATION_MODEL_OPTIONS).toEqual(expect.arrayContaining([
      {
        value: 'gemini-2.5-flash-lite',
        label: 'gemini-2.5-flash-lite',
        badge: 'Best',
      },
      {
        value: 'gemma-4-31b-it',
        label: 'gemma-4-31b-it',
        badge: 'Slow',
      },
      {
        value: 'qwen/qwen3.5-9b',
        label: 'qwen3.5-9b',
        badge: 'Slow',
      },
      {
        value: 'qwen/qwen3.7-flash',
        label: 'qwen3.7-flash',
        badge: 'Slow',
      },
    ]))
  })

  it('rejects the removed Qwen 3.6 Plus aliases', () => {
    expect(normalizeSelectableTranslationModel('qwen/qwen3.6-plus')).toBeNull()
    expect(normalizeSelectableTranslationModel('qwen3.6-plus')).toBeNull()
    expect(normalizeSelectableTranslationModel('qwen/qwen3.6-plus:free')).toBeNull()
  })

  it('normalizes Gemma 4 aliases', () => {
    expect(normalizeSelectableTranslationModel('gemma-4-31b-it')).toBe('gemma-4-31b-it')
    expect(normalizeSelectableTranslationModel('models/gemma-4-31b-it')).toBe('gemma-4-31b-it')
    expect(normalizeSelectableTranslationModel('gemma 4 31b')).toBe('gemma-4-31b-it')
    expect(normalizeSelectableTranslationModel('google/gemma-4-31b-it')).toBeNull()
    expect(normalizeSelectableTranslationModel('gemma-4-31b-it (openrouter)')).toBeNull()
  })

  it('normalizes Qwen 3.7 Flash aliases', () => {
    expect(normalizeSelectableTranslationModel('qwen/qwen3.7-flash')).toBe('qwen/qwen3.7-flash')
    expect(normalizeSelectableTranslationModel('qwen3.7-flash')).toBe('qwen/qwen3.7-flash')
    expect(normalizeSelectableTranslationModel('qwen/qwen3.7-flash (openrouter)')).toBe('qwen/qwen3.7-flash')
  })

  it('resolves runtime selections for the new models', () => {
    expect(resolveTranslationRuntimeSelection('gemma-4-31b-it')).toMatchObject({
      engineProvider: 'gemma',
      infrastructureProvider: 'google',
      runtimeModel: 'gemma-4-31b-it',
    })
    expect(resolveTranslationRuntimeSelection('qwen/qwen3.7-flash')).toMatchObject({
      engineProvider: 'qwen',
      infrastructureProvider: 'openrouter',
      runtimeModel: 'qwen/qwen3.7-flash',
      baseUrl: 'https://openrouter.ai/api/v1',
    })
  })
})

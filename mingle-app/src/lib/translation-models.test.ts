import { describe, expect, it } from 'vitest'
import {
  TRANSLATION_MODEL_OPTIONS,
  normalizeSelectableTranslationModel,
  resolveTranslationRuntimeSelection,
} from './translation-models'

describe('translation model catalog', () => {
  it('includes the supported Qwen and Google Gemma 4 options', () => {
    expect(TRANSLATION_MODEL_OPTIONS).toEqual(expect.arrayContaining([
      {
        value: 'gemma-4-31b-it',
        label: 'gemma-4-31b-it (slow)',
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

  it('resolves runtime selections for the new models', () => {
    expect(resolveTranslationRuntimeSelection('gemma-4-31b-it')).toMatchObject({
      engineProvider: 'gemma',
      infrastructureProvider: 'google',
      runtimeModel: 'gemma-4-31b-it',
    })
  })
})

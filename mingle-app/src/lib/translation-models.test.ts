import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SELECTABLE_TRANSLATION_MODEL,
  NEW_REGISTERED_USER_TRANSLATION_MODEL,
  TRANSLATION_MODEL_OPTIONS,
  normalizeSelectableTranslationModel,
  resolveTranslationRuntimeSelection,
} from './translation-models'

describe('translation model catalog', () => {
  it('keeps legacy unset accounts on Gemini while seeding new registered accounts with GPT-6 Luna', () => {
    expect(DEFAULT_SELECTABLE_TRANSLATION_MODEL).toBe('gemini-2.5-flash-lite')
    expect(NEW_REGISTERED_USER_TRANSLATION_MODEL).toBe('gpt-6-luna')
  })

  it('keeps closed-state labels compact while exposing open-menu badges as metadata', () => {
    expect(TRANSLATION_MODEL_OPTIONS).toEqual(expect.arrayContaining([
      {
        value: 'gemini-2.5-flash-lite',
        label: 'gemini-2.5-flash-lite',
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
        value: 'gpt-6-luna',
        label: 'gpt-6-luna',
        badge: 'Best',
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
    expect(normalizeSelectableTranslationModel('GPT-6-LUNA')).toBe('gpt-6-luna')
    expect(resolveTranslationRuntimeSelection('gpt-6-luna')).toMatchObject({
      engineProvider: 'openai',
      infrastructureProvider: 'openai',
      runtimeModel: 'gpt-6-luna',
    })
  })
})

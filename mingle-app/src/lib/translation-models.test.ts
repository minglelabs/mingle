import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SELECTABLE_TRANSLATION_MODEL,
  NEW_REGISTERED_USER_TRANSLATION_MODEL,
  TRANSLATION_MODEL_OPTIONS,
  normalizeSelectableTranslationModel,
  resolveTranslationRuntimeSelection,
} from './translation-models'

describe('translation model catalog', () => {
  it('uses GPT-6 Luna for unset accounts and for new registered accounts', () => {
    expect(DEFAULT_SELECTABLE_TRANSLATION_MODEL).toBe('gpt-6-luna')
    expect(NEW_REGISTERED_USER_TRANSLATION_MODEL).toBe('gpt-6-luna')
  })

  it('keeps closed-state labels compact while exposing open-menu badges as metadata', () => {
    expect(TRANSLATION_MODEL_OPTIONS).toEqual(expect.arrayContaining([
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
    ]))
  })

  it('rejects the removed Qwen aliases', () => {
    expect(normalizeSelectableTranslationModel('qwen/qwen3.5-9b')).toBeNull()
    expect(normalizeSelectableTranslationModel('qwen3.5-9b')).toBeNull()
    expect(normalizeSelectableTranslationModel('qwen/qwen3.6-plus')).toBeNull()
    expect(normalizeSelectableTranslationModel('qwen3.6-plus')).toBeNull()
    expect(normalizeSelectableTranslationModel('qwen/qwen3.6-plus:free')).toBeNull()
  })

  it('rejects the removed Gemma 4 aliases', () => {
    expect(normalizeSelectableTranslationModel('gemma-4-31b-it')).toBeNull()
    expect(normalizeSelectableTranslationModel('models/gemma-4-31b-it')).toBeNull()
    expect(normalizeSelectableTranslationModel('gemma 4 31b')).toBeNull()
  })

  it('resolves runtime selections for the new models', () => {
    expect(normalizeSelectableTranslationModel('GPT-6-LUNA')).toBe('gpt-6-luna')
    expect(resolveTranslationRuntimeSelection('gpt-6-luna')).toMatchObject({
      engineProvider: 'openai',
      infrastructureProvider: 'openai',
      runtimeModel: 'gpt-6-luna',
    })
    expect(normalizeSelectableTranslationModel('anthropic/claude-haiku-5-5')).toBe('claude-haiku-5-5')
    expect(resolveTranslationRuntimeSelection('claude-haiku-5-5')).toMatchObject({
      engineProvider: 'claude',
      infrastructureProvider: 'anthropic',
      runtimeModel: 'claude-haiku-5-5',
    })
  })
})

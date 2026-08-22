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

  it('normalizes Qwen 3.7 Flash aliases', () => {
    expect(normalizeSelectableTranslationModel('qwen/qwen3.7-flash')).toBe('qwen/qwen3.7-flash')
    expect(normalizeSelectableTranslationModel('qwen3.7-flash')).toBe('qwen/qwen3.7-flash')
    expect(normalizeSelectableTranslationModel('qwen/qwen3.7-flash (openrouter)')).toBe('qwen/qwen3.7-flash')
  })

  it('rejects removed translation model aliases', () => {
    expect(normalizeSelectableTranslationModel('gemma-4-31b-it')).toBeNull()
    expect(normalizeSelectableTranslationModel('models/gemma-4-31b-it')).toBeNull()
    expect(normalizeSelectableTranslationModel('qwen/qwen3.5-9b')).toBeNull()
    expect(normalizeSelectableTranslationModel('qwen/qwen3.5-9b:free')).toBeNull()
    expect(normalizeSelectableTranslationModel('qwen/qwen3.5-flash')).toBeNull()
    expect(normalizeSelectableTranslationModel('qwen3.5-flash')).toBeNull()
  })

  it('resolves runtime selection for Qwen 3.7 Flash in the US region', () => {
    expect(resolveTranslationRuntimeSelection('qwen/qwen3.7-flash')).toMatchObject({
      engineProvider: 'qwen',
      infrastructureProvider: 'qwencloud',
      runtimeModel: 'qwen3.7-flash',
      baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    })
  })
})

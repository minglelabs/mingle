import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SELECTABLE_TTS_MODEL,
  TTS_MODEL_OPTIONS,
  getFallbackTtsModel,
  getGeminiTtsModel,
  normalizeSelectableTtsModel,
  resolveTtsRuntimeSelection,
} from './tts-models'

describe('tts model catalog', () => {
  it('defaults unset users to soniox-tts-rt-v2', () => {
    expect(DEFAULT_SELECTABLE_TTS_MODEL).toBe('soniox-tts-rt-v2')
  })

  it('lists Soniox and the two Gemini models, default first, with the model id as the label', () => {
    expect(TTS_MODEL_OPTIONS).toEqual([
      { value: 'soniox-tts-rt-v2', label: 'soniox-tts-rt-v2' },
      { value: 'gemini-3.8-flash-lite-tts', label: 'gemini-3.8-flash-lite-tts' },
      { value: 'gemini-3.8-flash-tts', label: 'gemini-3.8-flash-tts' },
    ])
    expect(TTS_MODEL_OPTIONS[0].value).toBe(DEFAULT_SELECTABLE_TTS_MODEL)
  })

  it('normalizes supported values and rejects everything else, including the removed Inworld model', () => {
    expect(normalizeSelectableTtsModel(' Gemini-3.8-Flash-TTS ')).toBe('gemini-3.8-flash-tts')
    expect(normalizeSelectableTtsModel('gemini-3.8-flash-lite-tts')).toBe('gemini-3.8-flash-lite-tts')
    expect(normalizeSelectableTtsModel('SONIOX-TTS-RT-V2')).toBe('soniox-tts-rt-v2')
    expect(normalizeSelectableTtsModel('tts-rt-v2')).toBeNull()
    expect(normalizeSelectableTtsModel('inworld-tts-1.5-mini')).toBeNull()
    expect(normalizeSelectableTtsModel('gemini')).toBeNull()
    expect(normalizeSelectableTtsModel('inworld')).toBeNull()
    expect(normalizeSelectableTtsModel('toString')).toBeNull()
    expect(normalizeSelectableTtsModel('')).toBeNull()
    expect(normalizeSelectableTtsModel(null)).toBeNull()
    expect(normalizeSelectableTtsModel(42)).toBeNull()
  })

  it('resolves each model to its provider and runtime id', () => {
    expect(resolveTtsRuntimeSelection('soniox-tts-rt-v2')).toEqual({
      value: 'soniox-tts-rt-v2',
      provider: 'soniox',
      runtimeModel: 'tts-rt-v2',
    })
    expect(resolveTtsRuntimeSelection('gemini-3.8-flash-tts')).toEqual({
      value: 'gemini-3.8-flash-tts',
      provider: 'gemini',
      runtimeModel: 'gemini-3.8-flash-tts',
    })
    expect(resolveTtsRuntimeSelection('gemini-3.8-flash-lite-tts')).toEqual({
      value: 'gemini-3.8-flash-lite-tts',
      provider: 'gemini',
      runtimeModel: 'gemini-3.8-flash-lite-tts',
    })
  })

  it('resolves missing, invalid or removed values to the soniox-tts-rt-v2 default', () => {
    for (const value of [undefined, null, '', 'gemini', 'polly', 7, 'inworld-tts-1.5-mini', { ttsModel: 'gemini-3.8-flash-tts' }]) {
      expect(resolveTtsRuntimeSelection(value)).toEqual({
        value: 'soniox-tts-rt-v2',
        provider: 'soniox',
        runtimeModel: 'tts-rt-v2',
      })
    }
  })

  it('speaks with Flash-Lite when Soniox cannot, and keeps a Gemini selection', () => {
    expect(getGeminiTtsModel('soniox-tts-rt-v2')).toBe('gemini-3.8-flash-lite-tts')
    expect(getGeminiTtsModel('gemini-3.8-flash-tts')).toBe('gemini-3.8-flash-tts')
    expect(getGeminiTtsModel('gemini-3.8-flash-lite-tts')).toBe('gemini-3.8-flash-lite-tts')
  })

  it('retries a failed Gemini synthesis with the other Gemini model', () => {
    expect(getFallbackTtsModel('gemini-3.8-flash-lite-tts')).toBe('gemini-3.8-flash-tts')
    expect(getFallbackTtsModel('gemini-3.8-flash-tts')).toBe('gemini-3.8-flash-lite-tts')
  })
})

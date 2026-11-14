import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SELECTABLE_TTS_MODEL,
  TTS_MODEL_OPTIONS,
  getFallbackTtsModel,
  normalizeSelectableTtsModel,
  resolveTtsRuntimeSelection,
} from './tts-models'

describe('tts model catalog', () => {
  it('defaults unset users to gemini-3.8-flash-lite-tts', () => {
    expect(DEFAULT_SELECTABLE_TTS_MODEL).toBe('gemini-3.8-flash-lite-tts')
  })

  it('lists the two Gemini models, default first, with the model id as the label', () => {
    expect(TTS_MODEL_OPTIONS).toEqual([
      { value: 'gemini-3.8-flash-lite-tts', label: 'gemini-3.8-flash-lite-tts' },
      { value: 'gemini-3.8-flash-tts', label: 'gemini-3.8-flash-tts' },
    ])
    expect(TTS_MODEL_OPTIONS[0].value).toBe(DEFAULT_SELECTABLE_TTS_MODEL)
  })

  it('normalizes supported values and rejects everything else, including the removed Inworld model', () => {
    expect(normalizeSelectableTtsModel(' Gemini-3.8-Flash-TTS ')).toBe('gemini-3.8-flash-tts')
    expect(normalizeSelectableTtsModel('gemini-3.8-flash-lite-tts')).toBe('gemini-3.8-flash-lite-tts')
    expect(normalizeSelectableTtsModel('inworld-tts-1.5-mini')).toBeNull()
    expect(normalizeSelectableTtsModel('gemini')).toBeNull()
    expect(normalizeSelectableTtsModel('inworld')).toBeNull()
    expect(normalizeSelectableTtsModel('toString')).toBeNull()
    expect(normalizeSelectableTtsModel('')).toBeNull()
    expect(normalizeSelectableTtsModel(null)).toBeNull()
    expect(normalizeSelectableTtsModel(42)).toBeNull()
  })

  it('resolves Gemini models to their own runtime id', () => {
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

  it('resolves missing, invalid or removed values to the gemini-3.8-flash-lite-tts default', () => {
    for (const value of [undefined, null, '', 'gemini', 'polly', 7, 'inworld-tts-1.5-mini', { ttsModel: 'gemini-3.8-flash-tts' }]) {
      expect(resolveTtsRuntimeSelection(value)).toEqual({
        value: 'gemini-3.8-flash-lite-tts',
        provider: 'gemini',
        runtimeModel: 'gemini-3.8-flash-lite-tts',
      })
    }
  })

  it('retries a failed synthesis with the other Gemini model', () => {
    expect(getFallbackTtsModel('gemini-3.8-flash-lite-tts')).toBe('gemini-3.8-flash-tts')
    expect(getFallbackTtsModel('gemini-3.8-flash-tts')).toBe('gemini-3.8-flash-lite-tts')
  })
})

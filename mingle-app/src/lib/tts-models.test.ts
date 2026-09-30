import { afterEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_SELECTABLE_TTS_MODEL,
  TTS_MODEL_OPTIONS,
  getInworldTtsModelId,
  normalizeSelectableTtsModel,
  resolveTtsRuntimeSelection,
} from './tts-models'

const savedInworldModelId = process.env.INWORLD_TTS_MODEL_ID

afterEach(() => {
  if (savedInworldModelId === undefined) delete process.env.INWORLD_TTS_MODEL_ID
  else process.env.INWORLD_TTS_MODEL_ID = savedInworldModelId
})

describe('tts model catalog', () => {
  it('defaults unset users to gemini-3.8-flash-tts', () => {
    expect(DEFAULT_SELECTABLE_TTS_MODEL).toBe('gemini-3.8-flash-tts')
  })

  it('lists the three selectable models with the model id as the label and no badges', () => {
    expect(TTS_MODEL_OPTIONS).toEqual([
      { value: 'inworld-tts-1.5-mini', label: 'inworld-tts-1.5-mini' },
      { value: 'gemini-3.8-flash-tts', label: 'gemini-3.8-flash-tts' },
      { value: 'gemini-3.8-flash-lite-tts', label: 'gemini-3.8-flash-lite-tts' },
    ])
  })

  it('normalizes supported values and rejects everything else', () => {
    expect(normalizeSelectableTtsModel(' Gemini-3.8-Flash-TTS ')).toBe('gemini-3.8-flash-tts')
    expect(normalizeSelectableTtsModel('gemini-3.8-flash-lite-tts')).toBe('gemini-3.8-flash-lite-tts')
    expect(normalizeSelectableTtsModel('inworld-tts-1.5-mini')).toBe('inworld-tts-1.5-mini')
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

  it('resolves Inworld through INWORLD_TTS_MODEL_ID so production behavior is unchanged', () => {
    delete process.env.INWORLD_TTS_MODEL_ID
    expect(getInworldTtsModelId()).toBe('inworld-tts-1.5-mini')
    expect(resolveTtsRuntimeSelection('inworld-tts-1.5-mini')).toEqual({
      value: 'inworld-tts-1.5-mini',
      provider: 'inworld',
      runtimeModel: 'inworld-tts-1.5-mini',
    })
    process.env.INWORLD_TTS_MODEL_ID = 'inworld-tts-1.5-max'
    expect(resolveTtsRuntimeSelection('inworld-tts-1.5-mini').runtimeModel).toBe('inworld-tts-1.5-max')
  })

  it('resolves missing or invalid values to the gemini-3.8-flash-tts default', () => {
    delete process.env.INWORLD_TTS_MODEL_ID
    for (const value of [undefined, null, '', 'gemini', 'polly', 7, { ttsModel: 'inworld-tts-1.5-mini' }]) {
      expect(resolveTtsRuntimeSelection(value)).toEqual({
        value: 'gemini-3.8-flash-tts',
        provider: 'gemini',
        runtimeModel: 'gemini-3.8-flash-tts',
      })
    }
  })
})

import { describe, expect, it } from 'vitest'
import { TTS_MODEL, TTS_PROVIDER } from './tts-models'

describe('tts model', () => {
  it('is Gemini 3.8 Flash-Lite TTS, the only one', () => {
    expect(TTS_PROVIDER).toBe('gemini')
    expect(TTS_MODEL).toBe('gemini-3.8-flash-lite-tts')
  })
})

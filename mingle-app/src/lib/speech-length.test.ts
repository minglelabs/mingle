import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SPEECH_LENGTH_LEVEL,
  SPEECH_LENGTH_LEVELS,
  isExactSpeechLengthLevel,
  matchSpeechLengthLevel,
  resolveSpeechLengthPreferences,
} from '@/lib/speech-length'

const settings = (preferences: ReturnType<typeof resolveSpeechLengthPreferences>) => ({
  sttSegmentationMode: preferences.sttSegmentationMode,
  sonioxEndpointTuningStep: 'sonioxEndpointTuningStep' in preferences ? preferences.sonioxEndpointTuningStep : 2,
  sonioxManualFinalizeSilenceMs: 'sonioxManualFinalizeSilenceMs' in preferences ? preferences.sonioxManualFinalizeSilenceMs : 1000,
})

describe('speech length levels', () => {
  it('starts a new user on level 3: automatic detection step 5 of 5', () => {
    expect(DEFAULT_SPEECH_LENGTH_LEVEL).toBe(3)
    expect(resolveSpeechLengthPreferences(3)).toEqual({ sttSegmentationMode: 'end', sonioxEndpointTuningStep: 4 })
  })

  it('orders the six levels from automatic step 1 to 5 seconds of silence', () => {
    expect(SPEECH_LENGTH_LEVELS.map(resolveSpeechLengthPreferences)).toEqual([
      { sttSegmentationMode: 'end', sonioxEndpointTuningStep: 0 },
      { sttSegmentationMode: 'end', sonioxEndpointTuningStep: 2 },
      { sttSegmentationMode: 'end', sonioxEndpointTuningStep: 4 },
      { sttSegmentationMode: 'fin', sonioxManualFinalizeSilenceMs: 2000 },
      { sttSegmentationMode: 'fin', sonioxManualFinalizeSilenceMs: 3000 },
      { sttSegmentationMode: 'fin', sonioxManualFinalizeSilenceMs: 5000 },
    ])
  })

  it('reads each level back from the settings it wrote', () => {
    for (const level of SPEECH_LENGTH_LEVELS) {
      const written = settings(resolveSpeechLengthPreferences(level))
      expect(matchSpeechLengthLevel(written)).toBe(level)
      expect(isExactSpeechLengthLevel(level, written)).toBe(true)
    }
  })

  it('shows a setting from before the scale as the nearest level, without calling it exact', () => {
    const autoStep2 = { sttSegmentationMode: 'end' as const, sonioxEndpointTuningStep: 1, sonioxManualFinalizeSilenceMs: 1000 }
    expect(matchSpeechLengthLevel(autoStep2)).toBe(1)
    expect(isExactSpeechLengthLevel(1, autoStep2)).toBe(false)
    expect(matchSpeechLengthLevel({ ...autoStep2, sonioxEndpointTuningStep: 3 })).toBe(2)
    const oneSecond = { sttSegmentationMode: 'fin' as const, sonioxEndpointTuningStep: 4, sonioxManualFinalizeSilenceMs: 1000 }
    expect(matchSpeechLengthLevel(oneSecond)).toBe(4)
    expect(matchSpeechLengthLevel({ ...oneSecond, sonioxManualFinalizeSilenceMs: 3500 })).toBe(5)
    expect(matchSpeechLengthLevel({ ...oneSecond, sonioxManualFinalizeSilenceMs: 4500 })).toBe(6)
  })
})

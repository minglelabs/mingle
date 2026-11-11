import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SPEECH_LENGTH_OPTION,
  SPEECH_LENGTH_OPTIONS,
  matchSpeechLengthOption,
  resolveSpeechLengthPreferences,
} from '@/lib/speech-length'

describe('speech length choices', () => {
  it('starts a new user on automatic detection step 5 of 5', () => {
    expect(DEFAULT_SPEECH_LENGTH_OPTION).toBe('auto5')
    expect(resolveSpeechLengthPreferences('auto5')).toEqual({ sttSegmentationMode: 'end', sonioxEndpointTuningStep: 4 })
  })

  it('maps the four choices onto the room settings', () => {
    expect(resolveSpeechLengthPreferences('auto3')).toEqual({ sttSegmentationMode: 'end', sonioxEndpointTuningStep: 2 })
    expect(resolveSpeechLengthPreferences('silence2s')).toEqual({ sttSegmentationMode: 'fin', sonioxManualFinalizeSilenceMs: 2000 })
    expect(resolveSpeechLengthPreferences('silence3s')).toEqual({ sttSegmentationMode: 'fin', sonioxManualFinalizeSilenceMs: 3000 })
  })

  it('reads a choice back from the settings it wrote', () => {
    for (const option of SPEECH_LENGTH_OPTIONS) {
      const preferences = resolveSpeechLengthPreferences(option)
      expect(matchSpeechLengthOption({
        sttSegmentationMode: preferences.sttSegmentationMode,
        sonioxEndpointTuningStep: 'sonioxEndpointTuningStep' in preferences ? preferences.sonioxEndpointTuningStep : 2,
        sonioxManualFinalizeSilenceMs: 'sonioxManualFinalizeSilenceMs' in preferences ? preferences.sonioxManualFinalizeSilenceMs : 1000,
      })).toBe(option)
    }
  })

  it('matches nothing for a setting outside the four choices', () => {
    expect(matchSpeechLengthOption({ sttSegmentationMode: 'end', sonioxEndpointTuningStep: 0, sonioxManualFinalizeSilenceMs: 1000 })).toBeNull()
    expect(matchSpeechLengthOption({ sttSegmentationMode: 'fin', sonioxEndpointTuningStep: 4, sonioxManualFinalizeSilenceMs: 1000 })).toBeNull()
  })
})

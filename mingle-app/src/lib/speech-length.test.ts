import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SPEECH_LENGTH_LEVEL,
  SPEECH_LENGTH_LEVELS,
  groupSpeechLengthPreview,
  isExactSpeechLengthLevel,
  matchSpeechLengthLevel,
  resolveSpeechLengthPreferences,
  SPEECH_LENGTH_CARD_AFTER_BUBBLES,
  shouldShowSpeechLengthCard,
} from '@/lib/speech-length'

describe('first-run sentence length card', () => {
  it('waits for a few finished bubbles before asking', () => {
    expect(SPEECH_LENGTH_CARD_AFTER_BUBBLES).toBe(2)
    expect(shouldShowSpeechLengthCard(1)).toBe(false)
    expect(shouldShowSpeechLengthCard(2)).toBe(true)
    expect(shouldShowSpeechLengthCard(5)).toBe(true)
  })
})

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

describe('speech length preview', () => {
  const pieces = ['Hi!', 'I got here.', 'Nice day.', 'Tomorrow,', 'any food?', "Let's go!"]

  it('merges the example into one fewer bubble at each longer level', () => {
    expect(SPEECH_LENGTH_LEVELS.map((level) => groupSpeechLengthPreview(level, pieces).length)).toEqual([6, 5, 4, 3, 2, 1])
    expect(groupSpeechLengthPreview(6, pieces)).toEqual([{ key: 'p0', text: "Hi! I got here. Nice day. Tomorrow, any food? Let's go!" }])
    expect(groupSpeechLengthPreview(4, pieces).map((bubble) => bubble.key)).toEqual(['p0', 'p2', 'p4'])
  })

  it('joins Japanese and Chinese pieces without a space', () => {
    expect(groupSpeechLengthPreview(5, ['やあ!', '着いたよ。', 'いいね。', 'a', 'b', 'c'])[0].text).toBe('やあ! 着いたよ。いいね。')
    expect(groupSpeechLengthPreview(2, ['嗨！', '到了。', '', '', '', ''])[0].text).toBe('嗨！到了。')
  })
})

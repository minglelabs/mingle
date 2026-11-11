/**
 * How long a stretch of speech is kept together before it is translated, as
 * the four choices shown right after a new user's first translation. They map
 * onto the room's existing speech split settings (automatic detection steps
 * and silence-based split), so the room settings show the same choice.
 */
export const SPEECH_LENGTH_OPTIONS = ['auto3', 'auto5', 'silence2s', 'silence3s'] as const

export type SpeechLengthOption = (typeof SPEECH_LENGTH_OPTIONS)[number]

/** What a new user starts on: automatic detection, step 5 of 5. */
export const DEFAULT_SPEECH_LENGTH_OPTION: SpeechLengthOption = 'auto5'

export type SpeechLengthPreferences =
  | { sttSegmentationMode: 'end'; sonioxEndpointTuningStep: number }
  | { sttSegmentationMode: 'fin'; sonioxManualFinalizeSilenceMs: number }

/** Automatic detection steps are stored zero-based: step 3 of 5 is 2. */
const PREFERENCES: Record<SpeechLengthOption, SpeechLengthPreferences> = {
  auto3: { sttSegmentationMode: 'end', sonioxEndpointTuningStep: 2 },
  auto5: { sttSegmentationMode: 'end', sonioxEndpointTuningStep: 4 },
  silence2s: { sttSegmentationMode: 'fin', sonioxManualFinalizeSilenceMs: 2000 },
  silence3s: { sttSegmentationMode: 'fin', sonioxManualFinalizeSilenceMs: 3000 },
}

export function resolveSpeechLengthPreferences(option: SpeechLengthOption): SpeechLengthPreferences {
  return PREFERENCES[option]
}

/** The choice the current settings correspond to, or null for any other setting. */
export function matchSpeechLengthOption(settings: {
  sttSegmentationMode: 'fin' | 'end'
  sonioxEndpointTuningStep: number
  sonioxManualFinalizeSilenceMs: number
}): SpeechLengthOption | null {
  for (const option of SPEECH_LENGTH_OPTIONS) {
    const preferences = PREFERENCES[option]
    if (preferences.sttSegmentationMode !== settings.sttSegmentationMode) continue
    if (preferences.sttSegmentationMode === 'end') {
      if (preferences.sonioxEndpointTuningStep === settings.sonioxEndpointTuningStep) return option
    } else if (preferences.sonioxManualFinalizeSilenceMs === settings.sonioxManualFinalizeSilenceMs) {
      return option
    }
  }
  return null
}

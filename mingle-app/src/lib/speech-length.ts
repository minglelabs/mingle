/**
 * How long a stretch of speech is kept together before it is translated, as
 * one scale of six levels. The room has two ways to split speech (automatic
 * detection with five steps, and a fixed silence), which read as two unrelated
 * settings; the levels put them in one order, shortest to longest:
 *
 *   1  automatic detection, step 1 of 5
 *   2  automatic detection, step 3 of 5
 *   3  automatic detection, step 5 of 5   (what a new user starts on)
 *   4  2 seconds of silence
 *   5  3 seconds of silence
 *   6  5 seconds of silence
 *
 * The stored settings are unchanged; a level only names one combination.
 */
export const SPEECH_LENGTH_LEVELS = [1, 2, 3, 4, 5, 6] as const

export type SpeechLengthLevel = (typeof SPEECH_LENGTH_LEVELS)[number]

export const DEFAULT_SPEECH_LENGTH_LEVEL: SpeechLengthLevel = 3

/**
 * The first-run sentence length card waits for this many finished bubbles, so a
 * new user has seen a few translations at the default length before choosing.
 */
export const SPEECH_LENGTH_CARD_AFTER_BUBBLES = 4

/** True once enough new bubbles have finished in the first room for the length card. */
export function shouldShowSpeechLengthCard(newFinishedBubbles: number): boolean {
  return newFinishedBubbles >= SPEECH_LENGTH_CARD_AFTER_BUBBLES
}

export type SpeechLengthPreferences =
  | { sttSegmentationMode: 'end'; sonioxEndpointTuningStep: number }
  | { sttSegmentationMode: 'fin'; sonioxManualFinalizeSilenceMs: number }

/** Automatic detection steps are stored zero-based: step 3 of 5 is 2. */
const PREFERENCES: Record<SpeechLengthLevel, SpeechLengthPreferences> = {
  1: { sttSegmentationMode: 'end', sonioxEndpointTuningStep: 0 },
  2: { sttSegmentationMode: 'end', sonioxEndpointTuningStep: 2 },
  3: { sttSegmentationMode: 'end', sonioxEndpointTuningStep: 4 },
  4: { sttSegmentationMode: 'fin', sonioxManualFinalizeSilenceMs: 2000 },
  5: { sttSegmentationMode: 'fin', sonioxManualFinalizeSilenceMs: 3000 },
  6: { sttSegmentationMode: 'fin', sonioxManualFinalizeSilenceMs: 5000 },
}

export function resolveSpeechLengthPreferences(level: SpeechLengthLevel): SpeechLengthPreferences {
  return PREFERENCES[level]
}

/**
 * The level the current settings sit at. Settings saved before the scale
 * existed (automatic step 2 or 4 of 5, any other silence) show as the nearest
 * level; they keep their exact value until the user picks a level.
 */
export function matchSpeechLengthLevel(settings: {
  sttSegmentationMode: 'fin' | 'end'
  sonioxEndpointTuningStep: number
  sonioxManualFinalizeSilenceMs: number
}): SpeechLengthLevel {
  if (settings.sttSegmentationMode === 'end') {
    if (settings.sonioxEndpointTuningStep <= 1) return 1
    if (settings.sonioxEndpointTuningStep <= 3) return 2
    return 3
  }
  if (settings.sonioxManualFinalizeSilenceMs <= 2500) return 4
  if (settings.sonioxManualFinalizeSilenceMs <= 4000) return 5
  return 6
}

/** True when the settings are exactly the level's, not just nearest to it. */
export function isExactSpeechLengthLevel(level: SpeechLengthLevel, settings: {
  sttSegmentationMode: 'fin' | 'end'
  sonioxEndpointTuningStep: number
  sonioxManualFinalizeSilenceMs: number
}): boolean {
  const preferences = PREFERENCES[level]
  if (preferences.sttSegmentationMode !== settings.sttSegmentationMode) return false
  return preferences.sttSegmentationMode === 'end'
    ? preferences.sonioxEndpointTuningStep === settings.sonioxEndpointTuningStep
    : preferences.sonioxManualFinalizeSilenceMs === settings.sonioxManualFinalizeSilenceMs
}

/**
 * How the first-run card's example speech splits into bubbles at each level:
 * six short pieces become six bubbles at the shortest level and one at the
 * longest, so moving along the scale visibly merges or splits them.
 */
const PREVIEW_GROUPS: Record<SpeechLengthLevel, readonly (readonly number[])[]> = {
  1: [[0], [1], [2], [3], [4], [5]],
  2: [[0, 1], [2], [3], [4], [5]],
  3: [[0, 1], [2, 3], [4], [5]],
  4: [[0, 1], [2, 3], [4, 5]],
  5: [[0, 1, 2], [3, 4, 5]],
  6: [[0, 1, 2, 3, 4, 5]],
}

// Chinese and Japanese run sentences together without a space.
const NO_SPACE_AFTER = /[　-〿぀-ヿ㐀-鿿＀-￯]$/

export type SpeechLengthPreviewBubble = { key: string; text: string }

export function groupSpeechLengthPreview(level: SpeechLengthLevel, pieces: readonly string[]): SpeechLengthPreviewBubble[] {
  return PREVIEW_GROUPS[level]
    .map((indexes) => {
      const parts = indexes.map((index) => pieces[index]?.trim() ?? '').filter(Boolean)
      const text = parts.reduce((joined, part) => (
        !joined ? part : `${joined}${NO_SPACE_AFTER.test(joined) ? '' : ' '}${part}`
      ), '')
      // Keyed by the first piece, so a bubble that grows keeps its place.
      return { key: `p${indexes[0]}`, text }
    })
    .filter((bubble) => bubble.text)
}

/**
 * How long a stretch of speech is kept together before it is translated, as
 * one scale of five levels. The room has two ways to split speech (automatic
 * detection with five steps, and a fixed silence), which read as two unrelated
 * settings; the levels put them in one order, shortest to longest:
 *
 *   1  automatic detection, step 3 of 5
 *   2  automatic detection, step 5 of 5   (what a new user starts on)
 *   3  2 seconds of silence
 *   4  3.5 seconds of silence
 *   5  5 seconds of silence
 *
 * Steps 1-2 of 5 are left out: on real speech they split no shorter than step
 * 3. The stored settings are unchanged; a level only names one combination.
 */
export const SPEECH_LENGTH_LEVELS = [1, 2, 3, 4, 5] as const

export type SpeechLengthLevel = (typeof SPEECH_LENGTH_LEVELS)[number]

/**
 * The three stops shown first (the first-run card, and the room settings until
 * "More" is tapped): short, the recommended automatic one in the middle, long.
 */
export const SPEECH_LENGTH_SIMPLE_LEVELS = [1, 2, 4] as const satisfies readonly SpeechLengthLevel[]

export const DEFAULT_SPEECH_LENGTH_LEVEL: SpeechLengthLevel = 2

/** The level marked "Recommended". */
export const RECOMMENDED_SPEECH_LENGTH_LEVEL: SpeechLengthLevel = 2

export function isSimpleSpeechLengthLevel(level: SpeechLengthLevel): boolean {
  return (SPEECH_LENGTH_SIMPLE_LEVELS as readonly SpeechLengthLevel[]).includes(level)
}

/** The three-stop level nearest to a level: 2 seconds and 5 seconds of silence show as the long stop. */
export function simpleSpeechLengthLevel(current: SpeechLengthLevel): SpeechLengthLevel {
  return isSimpleSpeechLengthLevel(current) ? current : 4
}

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
  1: { sttSegmentationMode: 'end', sonioxEndpointTuningStep: 2 },
  2: { sttSegmentationMode: 'end', sonioxEndpointTuningStep: 4 },
  3: { sttSegmentationMode: 'fin', sonioxManualFinalizeSilenceMs: 2000 },
  4: { sttSegmentationMode: 'fin', sonioxManualFinalizeSilenceMs: 3500 },
  5: { sttSegmentationMode: 'fin', sonioxManualFinalizeSilenceMs: 5000 },
}

export function resolveSpeechLengthPreferences(level: SpeechLengthLevel): SpeechLengthPreferences {
  return PREFERENCES[level]
}

/**
 * The level the current settings sit at. Settings saved before the scale
 * existed (automatic step 1, 2 or 4 of 5, any other silence) show as the nearest
 * level; they keep their exact value until the user picks a level.
 */
export function matchSpeechLengthLevel(settings: {
  sttSegmentationMode: 'fin' | 'end'
  sonioxEndpointTuningStep: number
  sonioxManualFinalizeSilenceMs: number
}): SpeechLengthLevel {
  if (settings.sttSegmentationMode === 'end') {
    return settings.sonioxEndpointTuningStep <= 2 ? 1 : 2
  }
  if (settings.sonioxManualFinalizeSilenceMs <= 2700) return 3
  if (settings.sonioxManualFinalizeSilenceMs <= 4200) return 4
  return 5
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
 * How the card's example speech splits into bubbles at each level, as measured
 * on real speech: the short level splits at nearly every sentence, step 5 of 5
 * keeps two or three together, and the silences keep a whole thought.
 */
const PREVIEW_GROUPS: Record<SpeechLengthLevel, readonly (readonly number[])[]> = {
  1: [[0], [1], [2], [3], [4], [5]],
  2: [[0, 1], [2, 3], [4, 5]],
  3: [[0, 1, 2], [3, 4, 5]],
  4: [[0, 1, 2, 3, 4, 5]],
  5: [[0, 1, 2, 3, 4, 5]],
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

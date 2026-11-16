import { SPEECH_LENGTH_LEVELS, type SpeechLengthLevel } from '@/lib/speech-length'

/**
 * The speak trial: before signing in, a new device gets one room where it can
 * speak for TRIAL_SECONDS and see the translation, then picks a sentence
 * length and signs in to keep going. Done once per device; a device that has
 * ever signed in skips it.
 */
export const SPEAK_TRIAL_SECONDS = 10

const DONE_KEY = 'mingle.speakTrial.done'
const LEVEL_KEY = 'mingle.speakTrial.speechLength'

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export function isSpeakTrialDone(): boolean {
  try {
    return storage()?.getItem(DONE_KEY) === '1'
  } catch {
    return true
  }
}

export function markSpeakTrialDone(): void {
  try {
    storage()?.setItem(DONE_KEY, '1')
  } catch {
    // Without storage the trial simply shows again next time.
  }
}

/** The length picked at the end of the trial, applied to the account after sign-in. */
export function savePendingSpeechLength(level: SpeechLengthLevel): void {
  try {
    storage()?.setItem(LEVEL_KEY, String(level))
  } catch {
    // The account then starts on the default length.
  }
}

/** Reads and clears the length picked in the trial. */
export function takePendingSpeechLength(): SpeechLengthLevel | null {
  try {
    const raw = storage()?.getItem(LEVEL_KEY)
    if (raw == null) return null
    storage()?.removeItem(LEVEL_KEY)
    const level = Number(raw)
    return (SPEECH_LENGTH_LEVELS as readonly number[]).includes(level) ? (level as SpeechLengthLevel) : null
  } catch {
    return null
  }
}

/** Seconds left, given when the trial started listening. */
export function speakTrialSecondsLeft(startedAtMs: number | null, nowMs: number, totalSeconds = SPEAK_TRIAL_SECONDS): number {
  if (startedAtMs === null) return totalSeconds
  return Math.max(0, totalSeconds - (nowMs - startedAtMs) / 1000)
}

/** Ring colour from green (full) through amber to red (almost out). */
export function speakTrialRingColor(fractionLeft: number): string {
  const f = Math.min(1, Math.max(0, fractionLeft))
  // Hue 140 (green) down to 0 (red).
  return `hsl(${Math.round(140 * f)} 75% 45%)`
}

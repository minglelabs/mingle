import { afterEach, describe, expect, it } from 'vitest'
import {
  SPEAK_TRIAL_SECONDS,
  isSpeakTrialDone,
  markSpeakTrialDone,
  savePendingSpeechLength,
  speakTrialRingColor,
  speakTrialSecondsLeft,
  takePendingSpeechLength,
} from '@/lib/speak-trial'

class MemoryStorage {
  private values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  removeItem(key: string) { this.values.delete(key) }
}

function withStorage() {
  const storage = new MemoryStorage()
  ;(globalThis as { window?: unknown }).window = { localStorage: storage }
  return storage
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window
})

describe('speak trial countdown', () => {
  it('counts ten seconds down from when listening starts', () => {
    expect(SPEAK_TRIAL_SECONDS).toBe(10)
    expect(speakTrialSecondsLeft(null, 5000)).toBe(10)
    expect(speakTrialSecondsLeft(1000, 4500)).toBeCloseTo(6.5)
    expect(speakTrialSecondsLeft(1000, 20000)).toBe(0)
  })

  it('turns the ring from green to red', () => {
    expect(speakTrialRingColor(1)).toBe('hsl(140 75% 45%)')
    expect(speakTrialRingColor(0.5)).toBe('hsl(70 75% 45%)')
    expect(speakTrialRingColor(0)).toBe('hsl(0 75% 45%)')
  })
})

describe('speak trial storage', () => {
  it('is shown once per device', () => {
    withStorage()
    expect(isSpeakTrialDone()).toBe(false)
    markSpeakTrialDone()
    expect(isSpeakTrialDone()).toBe(true)
  })

  it('hands the picked length to the account once', () => {
    withStorage()
    savePendingSpeechLength(4)
    expect(takePendingSpeechLength()).toBe(4)
    expect(takePendingSpeechLength()).toBeNull()
  })

  it('ignores a stored value that is no level', () => {
    const storage = withStorage()
    storage.setItem('mingle.speakTrial.speechLength', '9')
    expect(takePendingSpeechLength()).toBeNull()
  })
})

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PRIMARY_UI_LOCALES } from '@/i18n/mingle-locales'
import { SPEAK_TRIAL_PHRASE_LOCALES, pickSpeakTrialPhrase, resolveSpeakTrialPhrases } from '@/i18n/speak-trial-phrases'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

// Owner feedback 2026-11-21: the 10 s ran out while the mic permission and the connection
// took 3-4 s; the hint was small, two sentences long, and covered the first bubble.
describe('speak trial: timing, hint and phrase', () => {
  it('counts the ten seconds from real listening (Stop shown red) or the first words, not from connecting', () => {
    const room = read('../components/LivePhoneDemo/LivePhoneDemo.tsx')
    expect(room).toContain('const isSttListening = isSttSessionRunning && !isConnecting && (isReady || isActive)')
    const trial = read('../components/onboarding/speak-trial.tsx')
    expect(trial).toContain('onSttListeningChange={handleListeningChange}')
    expect(trial).toContain('if (stats.messageCount > 0) startCountdown();')
    expect(trial).toContain('if (phase !== "listening" || startedAt === null) return;')
  })

  it('keeps the first bubble below the hint card', () => {
    expect(read('../components/onboarding/speak-trial.tsx')).toContain('topInsetPx: phase === "ready" || phase === "listening" ? hintCardHeight + 24 : undefined')
    expect(read('../components/LivePhoneDemo/LivePhoneDemo.tsx')).toContain("trialTopInsetPx && trialTopInsetPx > 0 ? `${trialTopInsetPx}px` : '0.625rem'")
  })

  it('suggests a short line to read aloud in every app language', () => {
    expect([...SPEAK_TRIAL_PHRASE_LOCALES].sort()).toEqual([...PRIMARY_UI_LOCALES].sort())
    for (const locale of PRIMARY_UI_LOCALES) {
      const phrases = resolveSpeakTrialPhrases(locale)
      expect(phrases.length, locale).toBeGreaterThanOrEqual(3)
      for (const phrase of phrases) expect(phrase.length, `${locale}: ${phrase}`).toBeLessThanOrEqual(40)
    }
    expect(pickSpeakTrialPhrase('ko', () => 0)).toBe('안녕! 만나서 반가워.')
  })
})

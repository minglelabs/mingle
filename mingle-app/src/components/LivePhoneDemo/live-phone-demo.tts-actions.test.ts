import { describe, expect, it } from 'vitest'
import { resolveLivePhoneDemoTtsActionCopy } from './live-phone-demo.tts-actions'

describe('resolveLivePhoneDemoTtsActionCopy', () => {
  it('resolves Korean labels', () => {
    const copy = resolveLivePhoneDemoTtsActionCopy('ko')

    expect(copy.playPronunciationLabel).toBe('발음 듣기')
    expect(copy.playbackFailedLabel).toBe('이 발화의 오디오를 재생하지 못했습니다.')
  })

  it('falls back to English for unsupported locales', () => {
    const copy = resolveLivePhoneDemoTtsActionCopy('pl')

    expect(copy.playPronunciationLabel).toBe('Listen to pronunciation')
    expect(copy.playbackFailedLabel).toBe('Failed to play audio for this message.')
  })

  it('covers every supported legal document locale', () => {
    const locales = [
      'ko',
      'en',
      'ja',
      'zh-CN',
      'zh-TW',
      'fr',
      'de',
      'es',
      'pt',
      'it',
      'ru',
      'ar',
      'hi',
      'th',
      'vi',
    ] as const

    for (const locale of locales) {
      const copy = resolveLivePhoneDemoTtsActionCopy(locale)
      expect(copy.playPronunciationLabel.length).toBeGreaterThan(0)
      expect(copy.playbackFailedLabel.length).toBeGreaterThan(0)
    }
  })
})

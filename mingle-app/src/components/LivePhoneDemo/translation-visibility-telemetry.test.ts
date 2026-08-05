import { describe, expect, it } from 'vitest'
import {
  buildTranslationVisibilityMetadata,
  getFinalTranslationVisibility,
} from './translation-visibility-telemetry'

describe('translation visibility telemetry', () => {
  it('records only finalized translation bubbles as visible', () => {
    const visibility = getFinalTranslationVisibility({
      id: 'utterance-1',
      originalLang: 'ko',
      targetLanguages: ['ko', 'en', 'ja'],
      translations: {
        en: 'Hello',
        ja: 'こんにちは',
      },
      translationFinalized: {
        en: true,
        ja: false,
      },
    })

    expect(visibility.expectedLanguages).toEqual(['en', 'ja'])
    expect(visibility.visibleLanguages).toEqual(['en'])
  })

  it('keeps a source-language bubble when it is intentionally rendered', () => {
    const visibility = getFinalTranslationVisibility({
      id: 'utterance-1',
      originalLang: 'ko',
      sourceLanguagesMixed: true,
      targetLanguages: ['ko', 'en'],
      translations: {
        ko: '안녕하세요',
        en: 'Hello',
      },
      translationFinalized: {
        ko: true,
        en: true,
      },
    })

    expect(visibility.expectedLanguages).toEqual(['ko', 'en'])
    expect(visibility.visibleLanguages).toEqual(['ko', 'en'])
  })

  it('uses the same duration for first and all visibility with one translation', () => {
    expect(buildTranslationVisibilityMetadata({
      sourceVisibleAtMs: 1_000,
      firstVisibleAtMs: 1_725,
      allVisibleAtMs: 1_725,
      visibleLanguages: ['en'],
    })).toEqual({
      translationFirstVisibleMs: 725,
      translationAllVisibleMs: 725,
      translationLanguages: ['en'],
    })
  })
})

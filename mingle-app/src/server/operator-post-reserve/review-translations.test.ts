import { describe, expect, it } from 'vitest'
import { reviewTranslationsFor, withReviewTranslation } from './review-translations'

describe('review translations', () => {
  it('keeps only the translations of the current text', () => {
    let value = withReviewTranslation(null, 'ko', '안녕', 'hello')
    value = withReviewTranslation(value, 'ja', 'こんにちは', 'hi')
    expect(reviewTranslationsFor(value, 'hello')).toEqual([{ language: 'ko', text: '안녕' }])
    expect(reviewTranslationsFor(value, 'something else')).toEqual([])
  })

  it('ignores malformed values', () => {
    expect(reviewTranslationsFor({ ko: 'x', ja: { text: '', sourceText: 'a' } }, 'a')).toEqual([])
    expect(reviewTranslationsFor(null, 'a')).toEqual([])
  })
})

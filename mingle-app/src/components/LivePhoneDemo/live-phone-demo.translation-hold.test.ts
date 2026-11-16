import { beforeEach, describe, expect, it } from 'vitest'
import { forgetAllShownTranslations, holdLastShownTranslation } from './live-phone-demo.translation-hold'

describe('holdLastShownTranslation', () => {
  beforeEach(() => forgetAllShownTranslations())

  it('shows a non-empty translation as it is', () => {
    expect(holdLastShownTranslation('m1', 'en', 'Hello')).toBeNull()
  })

  it('keeps the last text on screen when the translation blanks for a moment', () => {
    holdLastShownTranslation('m1', 'en', 'Hello there')
    expect(holdLastShownTranslation('m1', 'en', '')).toBe('Hello there')
    expect(holdLastShownTranslation('m1', 'en', '   ')).toBe('Hello there')
  })

  it('keeps languages and messages apart', () => {
    holdLastShownTranslation('m1', 'en', 'Hello')
    expect(holdLastShownTranslation('m1', 'ja', '')).toBeNull()
    expect(holdLastShownTranslation('m2', 'en', '')).toBeNull()
  })

  it('follows the newest text once it arrives', () => {
    holdLastShownTranslation('m1', 'en', 'Hello')
    holdLastShownTranslation('m1', 'en', 'Hello there')
    expect(holdLastShownTranslation('m1', 'en', '')).toBe('Hello there')
  })
})

import { describe, expect, it } from 'vitest'
import { clampLanguageLevel, sanitizeInterestLanguages, unzipInterestLanguages, zipInterestLanguages } from './interest-languages'

describe('interest languages', () => {
  it('keeps levels between 1 and 5', () => {
    expect(clampLanguageLevel(0)).toBe(1)
    expect(clampLanguageLevel(9)).toBe(5)
    expect(clampLanguageLevel(3.4)).toBe(3)
    expect(clampLanguageLevel('4')).toBe(1)
  })

  it('dedupes, drops unknown and own languages, and keeps at most three', () => {
    expect(sanitizeInterestLanguages([
      { code: 'ja', level: 2 },
      { code: 'JA', level: 5 },
      { code: 'ko', level: 3 },
      { code: 'xx', level: 1 },
      { code: 'en', level: 4 },
      { code: 'es', level: 1 },
      { code: 'fr', level: 1 },
    ], ['ko'])).toEqual([
      { code: 'ja', level: 2 },
      { code: 'en', level: 4 },
      { code: 'es', level: 1 },
    ])
    expect(sanitizeInterestLanguages('ja')).toEqual([])
  })

  it('round-trips through the two stored columns', () => {
    const languages = zipInterestLanguages(['ja', 'en'], [2])
    expect(languages).toEqual([{ code: 'ja', level: 2 }, { code: 'en', level: 1 }])
    expect(unzipInterestLanguages(languages)).toEqual({ interestLanguages: ['ja', 'en'], interestLanguageLevels: [2, 1] })
  })
})

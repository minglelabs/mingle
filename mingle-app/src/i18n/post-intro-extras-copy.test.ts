import { describe, expect, it } from 'vitest'
import { PRIMARY_UI_LOCALES } from '@/i18n/mingle-locales'
import { readPostIntro, sanitizePostIntroExtras } from '@/lib/post-category'
import { resolvePostIntroExtrasCopy } from './post-intro-extras-copy'

describe('post intro extras', () => {
  it('names every item in every language', () => {
    for (const locale of PRIMARY_UI_LOCALES) {
      const copy = resolvePostIntroExtrasCopy(locale)
      for (const list of [copy.jobs, copy.personality, copy.foods, copy.animals, copy.drinks, copy.interests]) {
        for (const [key, name] of Object.entries(list)) expect(name, `${locale} ${key}`).not.toBe(key)
      }
      expect(Object.values(copy.labels).every(Boolean), locale).toBe(true)
    }
  })

  it('keeps known keys only, three of each list at most', () => {
    expect(sanitizePostIntroExtras({ job: 'student', drink: 'beer', personality: ['warm', 'warm', 'calm', 'funny', 'honest'], foods: 'korean' })).toEqual({
      job: 'student', personality: ['warm', 'calm', 'funny'], foods: [], animals: [], drink: null, interests: [],
    })
  })

  it('reads an older intro with none of them', () => {
    expect(readPostIntro({ country: 'kr', age: 25, heightCm: null, hobbies: ['travel'] })).toMatchObject({ country: 'KR', hobbies: ['travel'], job: null, foods: [] })
  })
})

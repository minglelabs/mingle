import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildLanguageChips } from '@/lib/language-chips'
import { resolveMoreLanguagesCopy } from '@/i18n/more-languages-copy'
import { PRIMARY_UI_LOCALES } from '@/i18n/mingle-locales'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('language flags on a post or a bio', () => {
  it('own Korean, interest Japanese, written in Chinese: Chinese (original), Korean, Japanese, English, then more', () => {
    const chips = buildLanguageChips({ sourceLanguage: 'zh-CN', comfortableLanguage: 'ko', interestLanguages: ['ja'] })
    expect(chips.main).toEqual(['ko', 'ja', 'en'])
    expect(chips.more).not.toContain('zh-CN')
    expect(chips.more).not.toContain('ko')
    expect(chips.more.length).toBeGreaterThan(5)
  })

  it('own Hindi, interest French, written in English: English (original), Hindi, French, then more', () => {
    const chips = buildLanguageChips({ sourceLanguage: 'en', comfortableLanguage: 'hi', interestLanguages: ['fr'] })
    expect(chips.main).toEqual(['hi', 'fr'])
    expect(chips.more.slice(0, 3)).toEqual(['ko', 'ja', 'zh-CN'])
  })

  it('can be as short as the original alone, and never repeats a flag', () => {
    const chips = buildLanguageChips({ sourceLanguage: 'en', comfortableLanguage: 'en', interestLanguages: ['en'] })
    expect(chips.main).toEqual([])
    const korean = buildLanguageChips({ sourceLanguage: 'ko', comfortableLanguage: 'ko', interestLanguages: ['ko', 'ja'] })
    expect(korean.main).toEqual(['en'])
    expect(korean.more[0]).toBe('ja')
    const all = [...korean.main, ...korean.more].map((code) => code.toLowerCase())
    expect(new Set(all).size).toBe(all.length)
  })

  it('lists finished translations first under more, and keeps the own-language flag of a mixed post', () => {
    const chips = buildLanguageChips({ sourceLanguage: 'ko', comfortableLanguage: 'ko', interestLanguages: [], translatedLanguages: ['th'] })
    expect(chips.more[0]).toBe('th')
    expect(buildLanguageChips({ sourceLanguage: 'ko', sourceLanguagesMixed: true, comfortableLanguage: 'ko' }).main).toEqual(['ko', 'en'])
  })

  it('is used by posts and the profile bio, with a more button in every app language', () => {
    expect(read('src/components/feed/feed-post-card.tsx')).toContain('moreLanguages={moreChipLanguages}')
    expect(read('src/components/profile-bio.tsx')).toContain('moreLanguages={moreChipLanguages}')
    expect(read('src/components/feed/post-language-chips.tsx')).toContain('data-qa="language-chips-more"')
    for (const locale of PRIMARY_UI_LOCALES) expect(resolveMoreLanguagesCopy(locale).length).toBeGreaterThan(0)
  })
})

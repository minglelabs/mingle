import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildLanguageChips, isLanguageReady } from '@/lib/language-chips'
import { resolveLanguageSearchCopy, resolveMoreLanguagesCopy } from '@/i18n/more-languages-copy'
import { PRIMARY_UI_LOCALES } from '@/i18n/mingle-locales'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('language flags on a post or a bio', () => {
  it('own Korean, interest Japanese, written in Chinese: Chinese (original), Korean, Japanese, English', () => {
    const chips = buildLanguageChips({ sourceLanguage: 'zh-CN', comfortableLanguages: ['ko'], interestLanguages: ['ja'] })
    expect(chips.main).toEqual(['ko', 'ja', 'en'])
    // Nothing is made in any other language: nothing behind "+".
    expect(chips.more).toEqual([])
  })

  it('own Hindi, interest French, written in English: English (original), Hindi, French', () => {
    const chips = buildLanguageChips({ sourceLanguage: 'en', comfortableLanguages: ['hi'], interestLanguages: ['fr'], translatedLanguages: ['ko', 'ja', 'zh-CN'] })
    expect(chips.main).toEqual(['hi', 'fr'])
    // Behind "+": only what is already translated.
    expect(chips.more).toEqual(['ko', 'ja', 'zh-CN'])
  })

  it('can be as short as the original alone, and never repeats a flag', () => {
    const chips = buildLanguageChips({ sourceLanguage: 'en', comfortableLanguages: ['en'], interestLanguages: ['en'] })
    expect(chips.main).toEqual([])
    expect(chips.more).toEqual([])
    const korean = buildLanguageChips({ sourceLanguage: 'ko', comfortableLanguages: ['ko'], interestLanguages: ['ko', 'ja'], translatedLanguages: ['en', 'ja', 'th'] })
    expect(korean.main).toEqual(['en'])
    expect(korean.more).toEqual(['ja', 'th'])
  })

  it('keeps only the first own and interest language up front; the others go behind "+", before finished translations', () => {
    const chips = buildLanguageChips({
      sourceLanguage: 'ko',
      comfortableLanguages: ['en', 'fr'],
      interestLanguages: ['ja', 'es', 'de'],
      translatedLanguages: ['en', 'ja', 'zh-CN'],
    })
    expect(chips.main).toEqual(['en', 'ja'])
    expect(chips.more).toEqual(['fr', 'es', 'de', 'zh-CN'])
  })

  it('keeps a language picked on the search screen, and the own-language flag of a mixed post', () => {
    expect(buildLanguageChips({ sourceLanguage: 'ko', comfortableLanguages: ['ko'], pickedLanguages: ['sw'] }).more).toEqual(['sw'])
    expect(buildLanguageChips({ sourceLanguage: 'ko', sourceLanguagesMixed: true, comfortableLanguages: ['ko'] }).main).toEqual(['ko', 'en'])
  })

  it('knows which flags are not translated yet (drawn faded)', () => {
    expect(isLanguageReady('zh-cn', ['en', 'zh-CN'])).toBe(true)
    expect(isLanguageReady('hi', ['en', 'zh-CN'])).toBe(false)
  })

  it('is used by posts and the profile bio, with a more and a search button in every app language', () => {
    for (const file of ['src/components/feed/feed-post-card.tsx', 'src/components/profile-bio.tsx']) {
      const source = read(file)
      expect(source).toContain('moreLanguages={moreChipLanguages}')
      expect(source).toContain('readyLanguages={readyChipLanguages}')
      expect(source).toContain('searchLabel={resolveLanguageSearchCopy(locale)}')
    }
    const chips = read('src/components/feed/post-language-chips.tsx')
    expect(chips).toContain('data-qa="language-chips-more"')
    expect(chips).toContain('data-qa="language-chips-search"')
    // "..." right away when there is nothing behind "+".
    expect(chips).toContain('(expanded || extra.length === 0)')
    // The search screen slides in and goes back with an edge swipe (SlideSurface).
    expect(read('src/components/language-search-screen.tsx')).toContain('<SlideSurface')
    for (const locale of PRIMARY_UI_LOCALES) {
      expect(resolveMoreLanguagesCopy(locale).length).toBeGreaterThan(0)
      expect(resolveLanguageSearchCopy(locale).length).toBeGreaterThan(0)
    }
  })
})

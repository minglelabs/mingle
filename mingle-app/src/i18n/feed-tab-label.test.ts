import { describe, expect, it } from 'vitest'
import { getDictionary } from '@/i18n'
import { PRIMARY_UI_LOCALES } from '@/i18n/mingle-locales'

// The bottom tab bar names the feed tab with `tabs.feed`. The merged dictionary
// inherits missing keys from the default (Korean) dictionary, so every primary
// UI locale must define it or the tab reads "피드" in, say, Japanese.
describe('feed tab label (15 languages)', () => {
  it('is defined for every primary UI locale', () => {
    for (const locale of PRIMARY_UI_LOCALES) {
      const label = getDictionary(locale).tabs.feed
      expect(label, locale).toBeTruthy()
      expect(label!.trim(), locale).not.toBe('')
    }
  })

  it('is not the Korean word outside Korean', () => {
    const korean = getDictionary('ko').tabs.feed
    for (const locale of PRIMARY_UI_LOCALES) {
      if (locale === 'ko') continue
      expect(getDictionary(locale).tabs.feed, locale).not.toBe(korean)
    }
  })
})

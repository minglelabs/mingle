import { describe, expect, it } from 'vitest'
import { PRIMARY_UI_LOCALES } from '@/i18n/mingle-locales'
import { accountBadgeCopy } from './account-badge-copy'

describe('accountBadgeCopy', () => {
  it('has the official badge label and description in every primary UI locale (15)', () => {
    expect(PRIMARY_UI_LOCALES).toHaveLength(15)
    const descriptions = new Set<string>()
    for (const locale of PRIMARY_UI_LOCALES) {
      const copy = accountBadgeCopy(locale)
      expect(copy.official.length).toBeGreaterThan(0)
      expect(copy.officialDescription.length).toBeGreaterThan(0)
      descriptions.add(copy.officialDescription)
    }
    // Translated per locale, not an English fallback.
    expect(descriptions.size).toBe(15)
  })

  it('falls back to English for an unknown locale', () => {
    expect(accountBadgeCopy('xx').official).toBe('Official')
  })
})

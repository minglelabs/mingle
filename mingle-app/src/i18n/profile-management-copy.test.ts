import { describe, expect, it } from 'vitest'
import { LEGAL_DOCUMENT_LOCALES } from '@/i18n'
import { resolveProfileManagementCopy } from './profile-management-copy'

describe('profile management copy', () => {
  it('defines default-language and usage copy for all primary UI locales', () => {
    expect(LEGAL_DOCUMENT_LOCALES).toHaveLength(15)

    for (const locale of LEGAL_DOCUMENT_LOCALES) {
      const copy = resolveProfileManagementCopy(locale)
      expect(copy.defaultLanguages.trim()).not.toBe('')
      expect(copy.defaultLanguagesDescription.trim()).not.toBe('')
      expect(copy.usage.title.trim()).not.toBe('')
      expect(copy.usage.unknownLanguage.trim()).not.toBe('')
    }
  })

  it('falls back to English for an unsupported app locale', () => {
    expect(resolveProfileManagementCopy('pl').defaultLanguages).toBe('Default conversation languages')
    expect(resolveProfileManagementCopy('pl').usage.title).toBe('Usage')
  })
})

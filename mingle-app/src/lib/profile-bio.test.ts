import { describe, expect, it } from 'vitest'
import { PRIMARY_UI_LOCALES } from '@/i18n/mingle-locales'
import { profileBioCopy } from '@/i18n/profile-bio-copy'
import { resolveBioDisplayLanguage, sameBioLanguage } from './profile-bio'

describe('profile biography display policy', () => {
  it('uses the saved collapsed-message display language before profile or UI defaults', () => {
    expect(resolveBioDisplayLanguage('ja', ['ko'], ['fr'], 'en')).toBe('ja')
    expect(resolveBioDisplayLanguage(null, ['ko'], ['fr'], 'en')).toBe('ko')
    expect(resolveBioDisplayLanguage(null, [], ['fr'], 'en')).toBe('fr')
    expect(resolveBioDisplayLanguage(null, [], [], 'zh-TW')).toBe('zh-TW')
  })
  it('recognizes equivalent source/target codes and preserves Chinese script choice', () => {
    expect(sameBioLanguage('ko', 'ko')).toBe(true)
    expect(sameBioLanguage('zh', 'zh-CN')).toBe(true)
    expect(sameBioLanguage('zh-CN', 'zh-TW')).toBe(false)
    expect(sameBioLanguage(null, 'en')).toBe(false)
  })
  it.each(PRIMARY_UI_LOCALES)('provides all request, toggle, progress and failure copy in %s', locale => {
    const copy = profileBioCopy(locale)
    expect(Object.values(copy).every(value => value.trim().length > 0)).toBe(true)
    if (locale !== 'en') expect(copy.translate).not.toBe(profileBioCopy('en').translate)
  })
})

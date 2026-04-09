import { describe, expect, it } from 'vitest'

import {
  WEB_SUPPORTED_LOCALE_SEGMENTS,
  getVersionPolicyFallbackCopy,
  resolveVersionPolicyLocale,
  resolveWebLocaleSegment,
} from '../../rn/src/i18n'

describe('RN i18n bridge', () => {
  it('routes the WebView through the full app locale catalog', () => {
    expect(resolveWebLocaleSegment('pl-PL')).toBe('pl')
    expect(resolveWebLocaleSegment('he-IL')).toBe('he')
    expect(resolveWebLocaleSegment('zh-Hant-HK')).toBe('zh-TW')
    expect(resolveWebLocaleSegment('')).toBe('ko')
    expect(WEB_SUPPORTED_LOCALE_SEGMENTS.has('pl')).toBe(true)
  })

  it('keeps version-policy fallback copy on the primary UI locales', () => {
    expect(resolveVersionPolicyLocale('pl-PL')).toBe('en')
    expect(resolveVersionPolicyLocale('hi-IN')).toBe('hi')
    expect(getVersionPolicyFallbackCopy('pl').checkingTitle).toBe('Checking version')
    expect(getVersionPolicyFallbackCopy('ja').updateButtonLabel).toBe('アップデート')
  })
})

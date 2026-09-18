import { describe, expect, it } from 'vitest'
import { PRIMARY_UI_LOCALES } from '@/i18n/mingle-locales'
import { resolveLivePhoneDemoBubbleDisplayCopy } from './live-phone-demo.bubble-display-copy'

describe('LivePhoneDemo bubble display copy', () => {
  it('uses the user-facing Korean display mode labels', () => {
    const copy = resolveLivePhoneDemoBubbleDisplayCopy('ko')

    expect(copy.expandedModeLabel).toBe('번역문 펼쳐보기')
    expect(copy.collapsedModeLabel).toBe('하나의 말풍선으로 표시')
    expect(copy.expandBubbleLabel).toBe('펼치기')
    expect(copy.collapseBubbleLabel).toBe('접기')
  })

  it('defines concise expand and collapse labels for all 15 primary UI locales', () => {
    expect(PRIMARY_UI_LOCALES).toHaveLength(15)

    for (const locale of PRIMARY_UI_LOCALES) {
      const copy = resolveLivePhoneDemoBubbleDisplayCopy(locale)
      expect(copy.expandBubbleLabel.trim(), locale).not.toBe('')
      expect(copy.collapseBubbleLabel.trim(), locale).not.toBe('')
      expect(copy.expandBubbleLabel, locale).not.toContain('Chevron')
      expect(copy.collapseBubbleLabel, locale).not.toContain('Chevron')
    }
  })
})

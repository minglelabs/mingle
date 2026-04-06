import { LEGAL_DOCUMENT_LOCALES } from '@/i18n'
import { describe, expect, it } from 'vitest'
import { resolveLivePhoneDemoCopyActionCopy } from './live-phone-demo.copy-actions'

describe('live-phone-demo.copy-actions', () => {
  it('resolves Korean copy from a regional locale tag', () => {
    const copy = resolveLivePhoneDemoCopyActionCopy('ko-KR')
    expect(copy.copyBubbleLabel).toBe('복사')
    expect(copy.copyAllBubblesLabel).toBe('전체 발화 복사')
    expect(copy.copiedToastLabel).toBe('복사됨')
  })

  it('falls back to English for unsupported translated locales', () => {
    const copy = resolveLivePhoneDemoCopyActionCopy('sv-SE')
    expect(copy.copyBubbleLabel).toBe('Copy')
    expect(copy.copyAllBubblesLabel).toBe('Copy full message')
    expect(copy.copiedToastLabel).toBe('Copied')
  })

  it('defines a copied toast label for all 15 legal-document locales', () => {
    expect(LEGAL_DOCUMENT_LOCALES).toHaveLength(15)

    for (const locale of LEGAL_DOCUMENT_LOCALES) {
      const copy = resolveLivePhoneDemoCopyActionCopy(locale)
      expect(copy.copyBubbleLabel.trim().length).toBeGreaterThan(0)
      expect(copy.copiedToastLabel.trim().length).toBeGreaterThan(0)
    }
  })
})

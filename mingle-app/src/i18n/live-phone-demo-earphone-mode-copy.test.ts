import { LEGAL_DOCUMENT_LOCALES } from '@/i18n'
import { describe, expect, it } from 'vitest'
import { resolveLivePhoneDemoTtsActionCopy } from '@/components/LivePhoneDemo/live-phone-demo.tts-actions'
import { resolveLivePhoneDemoEarphoneModeCopy } from './live-phone-demo-earphone-mode-copy'

describe('live-phone-demo-earphone-mode-copy', () => {
  it('uses the requested Korean title and confirm label', () => {
    const copy = resolveLivePhoneDemoEarphoneModeCopy('ko-KR')
    expect(copy.label).toBe('이어폰 모드')
    expect(copy.noticeConfirmLabel).toBe('확인')
    expect(copy.noticeBody).toContain('이어폰이나 헤드셋')
    expect(copy.noticeNotConnectedBody).toContain('연결하면')
  })

  it('provides complete copy for all 15 primary UI locales', () => {
    expect(LEGAL_DOCUMENT_LOCALES).toHaveLength(15)
    for (const locale of LEGAL_DOCUMENT_LOCALES) {
      const copy = resolveLivePhoneDemoEarphoneModeCopy(locale)
      for (const value of Object.values(copy)) {
        expect(value.trim().length).toBeGreaterThan(0)
      }
      expect(copy.onStateLabel).not.toBe(copy.offStateLabel)
      expect(resolveLivePhoneDemoTtsActionCopy(locale).preparingIndicatorLabel.trim().length).toBeGreaterThan(0)
    }
  })

  it('falls back to English for an extended app locale', () => {
    expect(resolveLivePhoneDemoEarphoneModeCopy('sv-SE').label).toBe('Earphone mode')
  })
})

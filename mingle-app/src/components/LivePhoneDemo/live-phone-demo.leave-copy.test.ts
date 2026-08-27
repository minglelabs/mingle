import { LEGAL_DOCUMENT_LOCALES } from '@/i18n'
import { describe, expect, it } from 'vitest'
import { formatLivePhoneDemoLeaveNoticeText, resolveLivePhoneDemoConversationLeaveCopy } from './live-phone-demo.leave-copy'

describe('live-phone-demo.leave-copy', () => {
  it('resolves Korean leave copy from a regional locale tag', () => {
    const copy = resolveLivePhoneDemoConversationLeaveCopy('ko-KR')
    expect(copy.menuItemLabel).toBe('대화방 나가기')
    expect(copy.dialogMessage).toBe('나가시겠습니까?')
    expect(copy.successToastLabel).toBe('대화방에서 나갔습니다.')
  })

  it('falls back to English for unsupported translated locales', () => {
    const copy = resolveLivePhoneDemoConversationLeaveCopy('sv-SE')
    expect(copy.menuItemLabel).toBe('Leave')
    expect(copy.confirmLabel).toBe('Leave')
  })

  it('defines leave button, dialog, and toast labels for all legal-document locales', () => {
    for (const locale of LEGAL_DOCUMENT_LOCALES) {
      const copy = resolveLivePhoneDemoConversationLeaveCopy(locale)
      expect(copy.menuItemLabel.trim().length).toBeGreaterThan(0)
      expect(copy.dialogTitle.trim().length).toBeGreaterThan(0)
      expect(copy.dialogMessage.trim().length).toBeGreaterThan(0)
      expect(copy.cancelLabel.trim().length).toBeGreaterThan(0)
      expect(copy.confirmLabel.trim().length).toBeGreaterThan(0)
      expect(copy.leavingLabel.trim().length).toBeGreaterThan(0)
      expect(copy.successToastLabel.trim().length).toBeGreaterThan(0)
      expect(copy.errorToastLabel.trim().length).toBeGreaterThan(0)
      expect(copy.noticeTemplate).toContain('{name}')
    }
  })

  it('substitutes the departed member name into the notice template', () => {
    expect(formatLivePhoneDemoLeaveNoticeText('ko-KR', '지영')).toBe('지영님이 나가셨습니다.')
    expect(formatLivePhoneDemoLeaveNoticeText('en-US', 'Alice')).toBe('Alice left the conversation.')
  })
})

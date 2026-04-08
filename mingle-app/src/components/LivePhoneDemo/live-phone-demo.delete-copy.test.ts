import { LEGAL_DOCUMENT_LOCALES } from '@/i18n'
import { describe, expect, it } from 'vitest'
import { resolveLivePhoneDemoConversationDeleteCopy } from './live-phone-demo.delete-copy'

describe('live-phone-demo.delete-copy', () => {
  it('resolves Korean delete copy from a regional locale tag', () => {
    const copy = resolveLivePhoneDemoConversationDeleteCopy('ko-KR')
    expect(copy.menuItemLabel).toBe('대화 전체 삭제')
    expect(copy.dialogMessage).toBe('삭제하시겠습니까?')
    expect(copy.successToastLabel).toBe('대화가 전체 삭제되었습니다.')
  })

  it('resolves Traditional Chinese delete copy from a locale alias', () => {
    const copy = resolveLivePhoneDemoConversationDeleteCopy('zh-Hant-HK')
    expect(copy.menuItemLabel).toBe('刪除全部對話')
    expect(copy.confirmLabel).toBe('刪除')
  })

  it('falls back to English for unsupported translated locales', () => {
    const copy = resolveLivePhoneDemoConversationDeleteCopy('sv-SE')
    expect(copy.menuItemLabel).toBe('Delete all conversation messages')
    expect(copy.confirmLabel).toBe('Delete')
  })

  it('defines delete button, dialog, and toast labels for all 15 legal-document locales', () => {
    expect(LEGAL_DOCUMENT_LOCALES).toHaveLength(15)

    for (const locale of LEGAL_DOCUMENT_LOCALES) {
      const copy = resolveLivePhoneDemoConversationDeleteCopy(locale)
      expect(copy.menuItemLabel.trim().length).toBeGreaterThan(0)
      expect(copy.dialogTitle.trim().length).toBeGreaterThan(0)
      expect(copy.dialogMessage.trim().length).toBeGreaterThan(0)
      expect(copy.cancelLabel.trim().length).toBeGreaterThan(0)
      expect(copy.confirmLabel.trim().length).toBeGreaterThan(0)
      expect(copy.deletingLabel.trim().length).toBeGreaterThan(0)
      expect(copy.successToastLabel.trim().length).toBeGreaterThan(0)
      expect(copy.errorToastLabel.trim().length).toBeGreaterThan(0)
    }
  })
})

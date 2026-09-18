import { LEGAL_DOCUMENT_LOCALES } from '@/i18n'
import { describe, expect, it } from 'vitest'
import { resolveConversationImageCopy } from './conversation-image-copy'

describe('conversation-image-copy', () => {
  it('uses the mode name instead of a keyboard close instruction', () => {
    const copy = resolveConversationImageCopy('ko-KR')
    expect(copy.switchToVoiceMode).toBe('음성 모드로 전환')
    expect(copy.choose).toBe('사진 선택')
  })

  it('provides complete copy for all 15 primary UI locales', () => {
    expect(LEGAL_DOCUMENT_LOCALES).toHaveLength(15)

    for (const locale of LEGAL_DOCUMENT_LOCALES) {
      const copy = resolveConversationImageCopy(locale)
      for (const value of Object.values(copy)) {
        expect(value.trim().length).toBeGreaterThan(0)
      }
    }
  })

  it('falls back to English copy for an extended app locale', () => {
    expect(resolveConversationImageCopy('sv-SE').switchToVoiceMode).toBe('Switch to voice mode')
  })
})

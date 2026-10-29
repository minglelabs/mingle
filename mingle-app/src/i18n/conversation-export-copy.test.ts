import { describe, expect, it } from 'vitest'
import { SUPPORTED_LOCALES } from './config'
import { resolveConversationExportCopy } from './conversation-export-copy'

describe('resolveConversationExportCopy', () => {
  it('is localized and falls back to English', () => {
    expect(resolveConversationExportCopy('ko').menuLabel).toBe('대화 내보내기')
    expect(resolveConversationExportCopy('ja').photoPlaceholder).toBe('[写真]')
    expect(resolveConversationExportCopy('xx').menuLabel).toBe('Export chat')
  })

  it('fills every label in every supported locale', () => {
    for (const locale of SUPPORTED_LOCALES) {
      for (const value of Object.values(resolveConversationExportCopy(locale))) {
        expect(value.trim()).not.toBe('')
      }
    }
  })
})

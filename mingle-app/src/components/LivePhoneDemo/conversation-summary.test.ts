import { describe, expect, it } from 'vitest'
import {
  hasConversationSummaryContent,
  resolveConversationSummaryCopy,
} from './conversation-summary'

describe('resolveConversationSummaryCopy', () => {
  it('returns Korean finish copy for Korean locales', () => {
    expect(resolveConversationSummaryCopy('ko').finishAndSummarizeLabel).toBe('종료하고 요약하기')
  })

  it('falls back to English copy for other locales', () => {
    expect(resolveConversationSummaryCopy('fr').finishLabel).toBe('Finish')
  })
})

describe('hasConversationSummaryContent', () => {
  it('rejects a completely empty structured summary', () => {
    expect(hasConversationSummaryContent({
      overview: ' ',
      keyPoints: [],
      decisions: [],
      followUps: [],
      needsConfirmation: [],
    })).toBe(false)
  })

  it('accepts content in any structured section', () => {
    expect(hasConversationSummaryContent({
      overview: '',
      keyPoints: [],
      decisions: ['The order was confirmed.'],
      followUps: [],
      needsConfirmation: [],
    })).toBe(true)
  })
})

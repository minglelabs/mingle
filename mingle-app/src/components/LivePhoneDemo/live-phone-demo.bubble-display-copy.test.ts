import { describe, expect, it } from 'vitest'
import { resolveLivePhoneDemoBubbleDisplayCopy } from './live-phone-demo.bubble-display-copy'

describe('LivePhoneDemo bubble display copy', () => {
  it('uses the user-facing Korean display mode labels', () => {
    const copy = resolveLivePhoneDemoBubbleDisplayCopy('ko')

    expect(copy.expandedModeLabel).toBe('번역문 펼쳐보기')
    expect(copy.collapsedModeLabel).toBe('하나의 말풍선으로 표시')
  })
})

import { describe, expect, it } from 'vitest'
import { resolveLivePhoneDemoCopyActionCopy } from './live-phone-demo.copy-actions'

describe('live-phone-demo.copy-actions', () => {
  it('resolves Korean copy from a regional locale tag', () => {
    const copy = resolveLivePhoneDemoCopyActionCopy('ko-KR')
    expect(copy.copyAllBubblesLabel).toBe('전체 발화 복사')
    expect(copy.copiedToastLabel).toBe('복사됨')
  })

  it('falls back to English for unsupported translated locales', () => {
    const copy = resolveLivePhoneDemoCopyActionCopy('sv-SE')
    expect(copy.copyAllBubblesLabel).toBe('Copy full message')
    expect(copy.copiedToastLabel).toBe('Copied')
  })
})

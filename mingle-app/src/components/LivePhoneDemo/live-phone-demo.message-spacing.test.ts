import { describe, expect, it } from 'vitest'
import {
  resolveLivePhoneDemoMessageSpacing,
  resolveLivePhoneDemoMessageSpacingClass,
} from './live-phone-demo.message-spacing'

describe('live-phone-demo message spacing', () => {
  it('leaves the first message without an inter-message margin', () => {
    expect(resolveLivePhoneDemoMessageSpacingClass(null, { speakerUserId: 'user-1' })).toBe('')
    expect(resolveLivePhoneDemoMessageSpacing(undefined, { speakerUserId: 'user-1' })).toBe('first')
  })

  it('keeps a small visible gap between consecutive messages from the same account', () => {
    expect(resolveLivePhoneDemoMessageSpacing(
      { speakerUserId: 'user-1' },
      { speakerUserId: 'user-1' },
    )).toBe('same-speaker')
    expect(resolveLivePhoneDemoMessageSpacingClass(
      { speakerUserId: 'user-1' },
      { speakerUserId: 'user-1' },
    )).toBe('mt-1')
  })

  it('uses the reduced larger gap when the speaker changes', () => {
    expect(resolveLivePhoneDemoMessageSpacingClass(
      { speakerUserId: 'user-1' },
      { speakerUserId: 'user-2' },
    )).toBe('mt-1.5')
  })

  it('also groups solo-session messages by speaker label', () => {
    expect(resolveLivePhoneDemoMessageSpacing(
      { speaker: 'Speaker A' },
      { speaker: 'speaker a' },
    )).toBe('same-speaker')
    expect(resolveLivePhoneDemoMessageSpacing(
      { speaker: 'Speaker A' },
      { speaker: 'Speaker B' },
    )).toBe('different-speaker')
  })

  it('does not assume two unidentified messages came from the same speaker', () => {
    expect(resolveLivePhoneDemoMessageSpacing(
      { speaker: 'unknown' },
      { speaker: 'unknown' },
    )).toBe('different-speaker')
  })
})

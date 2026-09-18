import { describe, expect, it } from 'vitest'
import { chooseTooltipSide, didLongPressQualify } from './CopyableBubbleSurface'

describe('CopyableBubbleSurface long-press logic', () => {
  it('qualifies presses held past the long-press threshold', () => {
    expect(didLongPressQualify(1_000, 1_460)).toBe(true)
  })

  it('rejects shorter taps', () => {
    expect(didLongPressQualify(1_000, 1_300)).toBe(false)
    expect(didLongPressQualify(null, 1_460)).toBe(false)
  })

  it('uses the side with more room when neither side fits the full menu', () => {
    expect(chooseTooltipSide(120, 80)).toBe('above')
    expect(chooseTooltipSide(80, 120)).toBe('below')
  })

  it('prefers above when the full menu fits there', () => {
    expect(chooseTooltipSide(320, 12)).toBe('above')
  })
})

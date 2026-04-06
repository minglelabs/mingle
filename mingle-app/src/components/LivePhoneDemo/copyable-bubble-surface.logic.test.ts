import { describe, expect, it } from 'vitest'
import { didLongPressQualify } from './CopyableBubbleSurface'

describe('CopyableBubbleSurface long-press logic', () => {
  it('qualifies presses held past the long-press threshold', () => {
    expect(didLongPressQualify(1_000, 1_460)).toBe(true)
  })

  it('rejects shorter taps', () => {
    expect(didLongPressQualify(1_000, 1_300)).toBe(false)
    expect(didLongPressQualify(null, 1_460)).toBe(false)
  })
})

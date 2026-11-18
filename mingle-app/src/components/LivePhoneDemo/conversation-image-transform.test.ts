import { describe, expect, it } from 'vitest'
import { flipHorizontal, IDENTITY_IMAGE_TRANSFORM, isIdentityTransform, rotateLeft, transformedSize } from './conversation-image-transform'

describe('conversation image transform', () => {
  it('rotates left in quarter turns and wraps after four', () => {
    let t = IDENTITY_IMAGE_TRANSFORM
    t = rotateLeft(t)
    expect(t.quarterTurns).toBe(3)
    expect(isIdentityTransform(t)).toBe(false)
    t = rotateLeft(rotateLeft(rotateLeft(t)))
    expect(isIdentityTransform(t)).toBe(true)
  })
  it('flip toggles and two flips restore the original', () => {
    const once = flipHorizontal(IDENTITY_IMAGE_TRANSFORM)
    expect(once.flipped).toBe(true)
    expect(isIdentityTransform(flipHorizontal(once))).toBe(true)
  })
  it('swaps width and height on odd quarter turns', () => {
    expect(transformedSize(400, 300, { quarterTurns: 1, flipped: false })).toEqual({ width: 300, height: 400, scale: 1 })
    expect(transformedSize(400, 300, { quarterTurns: 2, flipped: true })).toEqual({ width: 400, height: 300, scale: 1 })
  })
  it('caps a 48MP photo at 2048px on the long edge (iOS canvas limit)', () => {
    const size = transformedSize(8064, 6048, { quarterTurns: 3, flipped: false })
    expect(size).toMatchObject({ width: 1536, height: 2048 })
    expect(size.width * size.height).toBeLessThan(16_777_216)
  })
})

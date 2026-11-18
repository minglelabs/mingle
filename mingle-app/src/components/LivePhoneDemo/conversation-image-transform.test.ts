import { describe, expect, it } from 'vitest'
import { flipHorizontal, IDENTITY_IMAGE_TRANSFORM, isIdentityTransform, rotateLeft, transformedImageType, transformedSize } from './conversation-image-transform'

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
    expect(transformedSize(400, 300, { quarterTurns: 1, flipped: false })).toEqual({ width: 300, height: 400 })
    expect(transformedSize(400, 300, { quarterTurns: 2, flipped: true })).toEqual({ width: 400, height: 300 })
  })
  it('keeps png/webp and encodes everything else as jpeg', () => {
    expect(transformedImageType('image/png')).toBe('image/png')
    expect(transformedImageType('image/webp')).toBe('image/webp')
    expect(transformedImageType('image/jpeg')).toBe('image/jpeg')
  })
})

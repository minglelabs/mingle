import { describe, expect, it } from 'vitest'
import { scaleToFit, validatePickedImage, MAX_IMAGE_BYTES } from './compose-image'

function fakeFile(type: string, size: number): File {
  const f = new File(['x'], 'photo', { type })
  Object.defineProperty(f, 'size', { value: size })
  return f
}

describe('scaleToFit', () => {
  it('never enlarges images already within bounds', () => {
    expect(scaleToFit(800, 600)).toEqual({ width: 800, height: 600 })
    expect(scaleToFit(2048, 1000)).toEqual({ width: 2048, height: 1000 })
  })

  it('downscales the longest edge to the max while keeping aspect ratio', () => {
    expect(scaleToFit(4096, 2048)).toEqual({ width: 2048, height: 1024 })
    expect(scaleToFit(1000, 4000)).toEqual({ width: 512, height: 2048 })
  })

  it('clamps to at least 1px', () => {
    const out = scaleToFit(10000, 1)
    expect(out.width).toBe(2048)
    expect(out.height).toBe(1)
  })
})

describe('validatePickedImage', () => {
  it('accepts jpeg/png/webp within the size cap', () => {
    expect(validatePickedImage(fakeFile('image/jpeg', 1000))).toBeNull()
    expect(validatePickedImage(fakeFile('image/png', 1000))).toBeNull()
    expect(validatePickedImage(fakeFile('image/webp', 1000))).toBeNull()
  })

  it('rejects unsupported types', () => {
    expect(validatePickedImage(fakeFile('image/gif', 1000))).toBe('unsupported')
    expect(validatePickedImage(fakeFile('application/pdf', 1000))).toBe('unsupported')
  })

  it('rejects files over the size cap', () => {
    expect(validatePickedImage(fakeFile('image/jpeg', MAX_IMAGE_BYTES + 1))).toBe('too_large')
  })
})

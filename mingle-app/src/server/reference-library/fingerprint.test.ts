import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { fingerprintDistance, isSamePhoto, referenceFingerprint } from './fingerprint'

/** A test picture: a gradient with a block, so it has structure to fingerprint. */
async function picture(width: number, height: number, flip = false): Promise<Buffer> {
  const pixels = Buffer.alloc(width * height * 3)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const block = x > width * 0.3 && x < width * 0.6 && y > height * 0.2 && y < height * 0.7
      const shade = Math.round(((flip ? width - x : x) / width) * 200) + (block ? 55 : 0)
      pixels.fill(Math.min(255, shade), (y * width + x) * 3, (y * width + x) * 3 + 3)
    }
  }
  return sharp(pixels, { raw: { width, height, channels: 3 } }).png().toBuffer()
}

describe('reference fingerprint', () => {
  it('matches the same photo resized and recompressed', async () => {
    const original = await picture(1200, 1600)
    const smaller = await sharp(original).resize(600, 800).jpeg({ quality: 60 }).toBuffer()
    const [a, b] = await Promise.all([referenceFingerprint(original), referenceFingerprint(smaller)])
    expect(fingerprintDistance(a, b)).toBeLessThanOrEqual(5)
    expect(isSamePhoto({ fingerprint: a, width: 1200, height: 1600 }, { fingerprint: b, width: 600, height: 800 })).toBe(true)
  })

  it('tells a different photo apart', async () => {
    const [a, b] = await Promise.all([referenceFingerprint(await picture(1200, 1600)), referenceFingerprint(await picture(1200, 1600, true))])
    expect(isSamePhoto({ fingerprint: a, width: 1200, height: 1600 }, { fingerprint: b, width: 1200, height: 1600 })).toBe(false)
  })

  it('needs about the same shape', () => {
    expect(isSamePhoto({ fingerprint: '00ff00ff00ff00ff', width: 1200, height: 1600 }, { fingerprint: '00ff00ff00ff00ff', width: 1600, height: 1200 })).toBe(false)
  })
})

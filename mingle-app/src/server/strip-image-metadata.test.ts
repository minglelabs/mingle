import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { stripImageMetadata } from './strip-image-metadata'

/** Create a small PNG with EXIF orientation metadata (simulates ChatGPT output with metadata). */
async function pngWithMetadata() {
  return sharp({ create: { width: 100, height: 50, channels: 3, background: '#ff6600' } })
    .png()
    .withMetadata({ orientation: 6 })
    .toBuffer()
}

/** Create a PNG with a simulated C2PA caBX chunk. */
async function pngWithC2PA() {
  const basePng = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#112233' } })
    .png()
    .toBuffer()

  const caBXData = Buffer.from('c2pa_manifest_jumbf_test_payload_caBX')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(caBXData.length)
  const type = Buffer.from('caBX')
  const crc = Buffer.alloc(4) // dummy CRC
  const caBXChunk = Buffer.concat([len, type, caBXData, crc])

  // Insert before IEND
  const iendIdx = basePng.indexOf(Buffer.from('IEND'))
  return Buffer.concat([basePng.subarray(0, iendIdx - 4), caBXChunk, basePng.subarray(iendIdx - 4)])
}

/** Create a small JPEG with EXIF, ICC, and XMP-like metadata. */
async function jpegWithMetadata() {
  return sharp({ create: { width: 200, height: 100, channels: 3, background: '#0066ff' } })
    .jpeg({ quality: 95 })
    .withMetadata({ orientation: 3 })
    .toBuffer()
}

/** Create a JPEG with a simulated C2PA APP11 segment. */
async function jpegWithC2PA() {
  const baseJpeg = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#0066ff' } })
    .jpeg({ quality: 95 })
    .toBuffer()

  const payload = Buffer.from('c2pa_jumbf_app11_marker_payload')
  const len = Buffer.alloc(2)
  len.writeUInt16BE(payload.length + 2)
  const app11 = Buffer.concat([Buffer.from([0xff, 0xeb]), len, payload])

  // Insert after SOI (first 2 bytes: 0xFF, 0xD8)
  return Buffer.concat([baseJpeg.subarray(0, 2), app11, baseJpeg.subarray(2)])
}

/** Create a WebP with metadata. */
async function webpWithMetadata() {
  return sharp({ create: { width: 80, height: 40, channels: 3, background: '#00ff66' } })
    .webp()
    .withMetadata({ orientation: 8 })
    .toBuffer()
}

describe('stripImageMetadata', () => {
  it('preserves PNG format and strips EXIF orientation and metadata by default', async () => {
    const input = await pngWithMetadata()
    const inputMeta = await sharp(input).metadata()
    expect(inputMeta.orientation).toBe(6)
    expect(inputMeta.format).toBe('png')

    const output = await stripImageMetadata(input)
    const outputMeta = await sharp(output).metadata()

    // Default 'preserve' keeps PNG format losslessly
    expect(outputMeta.format).toBe('png')
    expect(outputMeta.exif).toBeUndefined()
    expect(outputMeta.orientation).toBeUndefined()
    expect(outputMeta.iptc).toBeUndefined()
    expect(outputMeta.xmp).toBeUndefined()
    // Rotation applied: 100×50 with orientation 6 → 50×100
    expect(outputMeta.width).toBe(50)
    expect(outputMeta.height).toBe(100)
  })

  it('removes C2PA (caBX) chunk completely from PNG while preserving PNG format', async () => {
    const input = await pngWithC2PA()
    expect(input.includes(Buffer.from('caBX'))).toBe(true)
    expect(input.includes(Buffer.from('c2pa_manifest_jumbf_test_payload_caBX'))).toBe(true)

    const output = await stripImageMetadata(input, { format: 'preserve' })
    const outputMeta = await sharp(output).metadata()

    expect(outputMeta.format).toBe('png')
    expect(output.includes(Buffer.from('caBX'))).toBe(false)
    expect(output.includes(Buffer.from('c2pa_manifest_jumbf_test_payload_caBX'))).toBe(false)
  })

  it('removes C2PA (APP11) segment from JPEG while preserving JPEG format', async () => {
    const input = await jpegWithC2PA()
    expect(input.includes(Buffer.from('c2pa_jumbf_app11_marker_payload'))).toBe(true)

    const output = await stripImageMetadata(input)
    const outputMeta = await sharp(output).metadata()

    expect(outputMeta.format).toBe('jpeg')
    expect(output.includes(Buffer.from('c2pa_jumbf_app11_marker_payload'))).toBe(false)
  })

  it('preserves JPEG format and strips EXIF and IPTC', async () => {
    const input = await jpegWithMetadata()
    const inputMeta = await sharp(input).metadata()
    expect(inputMeta.orientation).toBe(3)

    const output = await stripImageMetadata(input, { quality: 80 })
    const outputMeta = await sharp(output).metadata()

    expect(outputMeta.format).toBe('jpeg')
    expect(outputMeta.exif).toBeUndefined()
    expect(outputMeta.orientation).toBeUndefined()
    expect(outputMeta.iptc).toBeUndefined()
  })

  it('preserves WebP format and strips EXIF', async () => {
    const input = await webpWithMetadata()
    const output = await stripImageMetadata(input)
    const outputMeta = await sharp(output).metadata()

    expect(outputMeta.format).toBe('webp')
    expect(outputMeta.exif).toBeUndefined()
    expect(outputMeta.orientation).toBeUndefined()
  })

  it('forces JPEG output and flattens transparency when format: "jpeg" is requested', async () => {
    const transparentPng = await sharp({
      create: { width: 10, height: 10, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer()

    const output = await stripImageMetadata(transparentPng, { format: 'jpeg' })
    const outputMeta = await sharp(output).metadata()

    expect(outputMeta.format).toBe('jpeg')
    expect(outputMeta.channels).toBe(3)
  })

  it('forces PNG output when format: "png" is requested on a JPEG input', async () => {
    const jpegInput = await jpegWithMetadata()
    const output = await stripImageMetadata(jpegInput, { format: 'png' })
    const outputMeta = await sharp(output).metadata()

    expect(outputMeta.format).toBe('png')
    expect(outputMeta.exif).toBeUndefined()
  })

  it('preserves 100% pixel resolution when maxDimension is omitted', async () => {
    const input = await sharp({ create: { width: 1920, height: 1080, channels: 3, background: '#123456' } })
      .png()
      .toBuffer()

    const output = await stripImageMetadata(input)
    const outputMeta = await sharp(output).metadata()

    expect(outputMeta.width).toBe(1920)
    expect(outputMeta.height).toBe(1080)
  })

  it('respects maxDimension and downsizes large images when specified', async () => {
    const largeInput = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: '#aabbcc' } })
      .png()
      .toBuffer()

    const output = await stripImageMetadata(largeInput, { maxDimension: 1024 })
    const outputMeta = await sharp(output).metadata()

    expect(outputMeta.width).toBeLessThanOrEqual(1024)
    expect(outputMeta.height).toBeLessThanOrEqual(1024)
  })

  it('does not enlarge small images when maxDimension is larger than image', async () => {
    const smallInput = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#112233' } })
      .png()
      .toBuffer()

    const output = await stripImageMetadata(smallInput, { maxDimension: 1024 })
    const outputMeta = await sharp(output).metadata()

    expect(outputMeta.width).toBe(32)
    expect(outputMeta.height).toBe(32)
  })

  it('preserves alpha transparency for PNG by default (format: preserve)', async () => {
    const transparentPng = await sharp({
      create: { width: 10, height: 10, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0.5 } },
    })
      .png()
      .toBuffer()

    const output = await stripImageMetadata(transparentPng)
    const outputMeta = await sharp(output).metadata()

    expect(outputMeta.format).toBe('png')
    expect(outputMeta.channels).toBe(4)
  })

  it('throws error on invalid image data', async () => {
    const invalidBuffer = Buffer.from('mock-non-image-payload')
    await expect(stripImageMetadata(invalidBuffer)).rejects.toThrow()
  })
})

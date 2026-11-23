import sharp from 'sharp'

const PANEL_HEIGHT = 1024
const PANEL_GAP = 24

/** Two photos side by side in one image: the image route takes one attachment. */
export async function pairImages(left: Buffer, right: Buffer): Promise<Buffer> {
  const [a, b] = await Promise.all([left, right].map((bytes) => sharp(bytes, { limitInputPixels: 80_000_000 })
    .rotate()
    .resize({ height: PANEL_HEIGHT })
    .jpeg({ quality: 90 })
    .toBuffer({ resolveWithObject: true })))
  return sharp({ create: { width: a.info.width + PANEL_GAP + b.info.width, height: PANEL_HEIGHT, channels: 3, background: '#ffffff' } })
    .composite([{ input: a.data, left: 0, top: 0 }, { input: b.data, left: a.info.width + PANEL_GAP, top: 0 }])
    .jpeg({ quality: 90 })
    .toBuffer()
}

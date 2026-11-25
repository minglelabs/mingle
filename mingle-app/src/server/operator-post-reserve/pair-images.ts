import sharp from 'sharp'

const PANEL_HEIGHT = 1024
const PANEL_GAP = 24

/** Two photos side by side in one image: the image route takes one attachment. */
export async function pairImages(left: Buffer, right: Buffer): Promise<Buffer> {
  return stripImages([left, right])
}

/** Photos side by side, left to right, at one height, in one image. */
export async function stripImages(images: Buffer[]): Promise<Buffer> {
  const panels = await Promise.all(images.map((bytes) => sharp(bytes, { limitInputPixels: 80_000_000 })
    .rotate()
    .resize({ height: PANEL_HEIGHT })
    .jpeg({ quality: 90 })
    .toBuffer({ resolveWithObject: true })))
  const width = panels.reduce((sum, panel) => sum + panel.info.width, 0) + PANEL_GAP * (panels.length - 1)
  let left = 0
  const composite = panels.map((panel) => {
    const at = { input: panel.data, left, top: 0 }
    left += panel.info.width + PANEL_GAP
    return at
  })
  return sharp({ create: { width, height: PANEL_HEIGHT, channels: 3, background: '#ffffff' } })
    .composite(composite)
    .jpeg({ quality: 90 })
    .toBuffer()
}

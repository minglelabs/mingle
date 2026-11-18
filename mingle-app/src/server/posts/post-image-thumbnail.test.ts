import sharp from 'sharp'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearPostImageThumbnails, getPostImageThumbnail } from './post-image-thumbnail'

async function photo(width: number, height: number): Promise<Uint8Array> {
  return new Uint8Array(await sharp({ create: { width, height, channels: 3, background: { r: 200, g: 80, b: 40 } } }).jpeg().toBuffer())
}

describe('getPostImageThumbnail', () => {
  beforeEach(() => clearPostImageThumbnails())

  it('shrinks the photo so its longest edge is 400, keeping the ratio', async () => {
    const original = await photo(1600, 1200)
    const thumbnail = await getPostImageThumbnail('k1', async () => original)
    const meta = await sharp(thumbnail).metadata()
    expect([meta.width, meta.height]).toEqual([400, 300])
    expect(meta.format).toBe('jpeg')
    expect(thumbnail.byteLength).toBeLessThan(original.byteLength)
  })

  it('does not enlarge a small photo', async () => {
    const meta = await sharp(await getPostImageThumbnail('k2', () => photo(120, 90))).metadata()
    expect([meta.width, meta.height]).toEqual([120, 90])
  })

  it('reads the stored photo once per key, also for requests that arrive together', async () => {
    const original = await photo(800, 800)
    const load = vi.fn(async () => original)
    await Promise.all([getPostImageThumbnail('k3', load), getPostImageThumbnail('k3', load)])
    await getPostImageThumbnail('k3', load)
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('does not keep a failed read', async () => {
    await expect(getPostImageThumbnail('k4', async () => { throw new Error('gone') })).rejects.toThrow('gone')
    const meta = await sharp(await getPostImageThumbnail('k4', () => photo(800, 400))).metadata()
    expect(meta.width).toBe(400)
  })
})

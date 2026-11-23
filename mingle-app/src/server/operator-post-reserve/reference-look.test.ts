import sharp from 'sharp'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/server/operator-avatars/generate', () => ({ requestAvatarImage: vi.fn() }))
vi.mock('@/server/posts/post-image-storage', () => ({ putPostImage: vi.fn(), getPostImage: vi.fn() }))

import { buildPostImagePrompt, neutralizeReferenceLook } from './post-image'

describe('face reference without its filter', () => {
  it('takes a milky blue cast out of the attached photo', async () => {
    const milky = await sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 170, g: 200, b: 225 } } }).jpeg().toBuffer()
    const out = await neutralizeReferenceLook({ bytes: milky, mimeType: 'image/jpeg' })
    const [r, , b] = (await sharp(out.bytes).stats()).channels.map((c) => c.mean)
    expect(b - r).toBeLessThan(225 - 170)
  })

  it('says the attached photo colors are not the new photo colors', () => {
    const prompt = buildPostImagePrompt('[self] at a bakery', 'Tokyo, Japan', () => 0.4, { look: 'x', hasReference: true, gender: 'female' })
    expect(prompt).toContain('colors are not this photo')
  })
})

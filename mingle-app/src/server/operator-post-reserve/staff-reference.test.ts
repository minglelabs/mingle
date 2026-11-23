import sharp from 'sharp'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/server/operator-avatars/generate', () => ({ requestAvatarImage: vi.fn() }))
vi.mock('@/server/posts/post-image-storage', () => ({ putPostImage: vi.fn() }))

import { withStaffReference } from './post-image'

const photo = (width: number, height: number) => sharp({ create: { width, height, channels: 3, background: '#888888' } }).jpeg().toBuffer()

describe('a photo staff attach to their feedback', () => {
  it('goes alone when there is no photo of the poster', async () => {
    const staff = { bytes: await photo(40, 60), mimeType: 'image/jpeg' }
    const result = await withStaffReference({ prompt: 'P', reference: null }, staff)
    expect(result.reference).toBe(staff)
    expect(result.prompt).toContain('reference staff added to their feedback')
  })

  it('sits left of the poster\'s photo in one image', async () => {
    const result = await withStaffReference(
      { prompt: 'P', reference: { bytes: await photo(40, 40), mimeType: 'image/jpeg' } },
      { bytes: await photo(40, 80), mimeType: 'image/jpeg' },
    )
    expect(result.prompt).toContain('RIGHT: the photo of the poster')
    const meta = await sharp(result.reference.bytes).metadata()
    expect(meta.height).toBe(1024)
    expect(meta.width).toBe(512 + 24 + 1024)
  })
})

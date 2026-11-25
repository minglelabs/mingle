import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/server/operator-avatars/generate', () => ({ requestAvatarImage: vi.fn() }))
vi.mock('@/server/posts/post-image-storage', () => ({ putPostImage: vi.fn(), getPostImage: vi.fn() }))

import { buildPostImagePrompt } from './post-image'
import { faceStickerLine, pickFaceStickers, STICKER_COUNT, STICKER_SUBJECTS } from './face-stickers'

describe('friend face stickers', () => {
  it('has about 800 stickers with distinct subjects', () => {
    expect(STICKER_COUNT).toBe(800)
    expect(new Set(STICKER_SUBJECTS).size).toBe(STICKER_SUBJECTS.length)
  })

  it('gives each friend a different sticker', () => {
    let seed = 0.13
    const random = () => (seed = (seed * 9301 + 0.49297) % 1)
    const picks = pickFaceStickers(random, 3)
    expect(new Set(picks.map((pick) => pick.split(' in ')[0])).size).toBe(3)
    expect(faceStickerLine(() => 0.5)).toContain("The poster's own face is NOT covered")
  })

  it('goes on most group photos and never on a selfie', () => {
    const person = { look: 'x', hasReference: true, gender: 'female' }
    expect(buildPostImagePrompt('[friends] with two friends at a bar', 'Seoul', () => 0.3, person)).toContain('sticker')
    expect(buildPostImagePrompt('[self] at a bar', 'Seoul', () => 0.3, person)).not.toContain('sticker added on top')
  })
})

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/server/operator-avatars/generate', () => ({ requestAvatarImage: vi.fn() }))
vi.mock('@/server/posts/post-image-storage', () => ({ putPostImage: vi.fn() }))

import { buildPostImagePrompt } from './post-image'

describe('post photo prompt', () => {
  it('describes a phone snapshot without people', () => {
    const prompt = buildPostImagePrompt('a bowl of ramen on a counter')
    expect(prompt).toContain('It shows: a bowl of ramen on a counter')
    expect(prompt).toContain('No face and no recognizable person')
    expect(prompt).not.toContain('Taken in')
  })

  it('ties the scene and any writing to the account\'s city', () => {
    expect(buildPostImagePrompt('a street corner', 'Sapporo, Japan')).toContain('Taken in Sapporo, Japan')
  })

  it('shares what is on a screen as a screenshot, not a photo of the phone', () => {
    const prompt = buildPostImagePrompt('Screenshot of Korean grammar notes highlighted in yellow', 'Tokyo, Japan')
    expect(prompt).toContain('A screenshot saved on a phone')
    expect(prompt).toContain('not a photo of a phone')
    expect(prompt).not.toContain('casual photo')
  })
})

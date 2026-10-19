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

describe('photos of the poster', () => {
  const person = { look: 'a Japanese woman in her early twenties, short black hair', hasReference: true }

  it('describes the poster and keeps the face of the attached photo', () => {
    const prompt = buildPostImagePrompt('[self] the poster on a rooftop holding her hair', 'Seoul, South Korea', () => 0.5, person)
    expect(prompt).toContain('It shows: the poster on a rooftop holding her hair')
    expect(prompt).toContain('The poster is the person in the attached photo')
    expect(prompt).toContain('completely different photo')
    expect(prompt).not.toContain('The poster: a Japanese woman')
    expect(prompt).toContain('face is clearly visible')
    expect(prompt).toContain('no school uniforms')
    expect(prompt).not.toContain('No face and no recognizable person')
    expect(prompt).toContain('The focus is on the person')
    expect(prompt).toContain('Skin: clean and clear')
    expect(prompt).not.toContain('as sharp as the subject')
  })

  it('hides the face when the kind says so, and describes the look when no photo is attached', () => {
    const prompt = buildPostImagePrompt('[self_faceless] outfit from above', null, () => 0.5, { ...person, hasReference: false })
    expect(prompt).toContain('face is not visible')
    expect(prompt).toContain('The poster: a Japanese woman')
    expect(prompt).not.toContain('attached photo')
  })

  it('draws an untagged description as a scene without people', () => {
    expect(buildPostImagePrompt('a bowl of ramen', null, () => 0.5, person)).toContain('No face and no recognizable person')
  })
})

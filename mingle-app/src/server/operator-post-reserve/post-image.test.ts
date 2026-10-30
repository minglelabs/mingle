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

  it('keeps a photo of people a photo when it mentions the phone screen', () => {
    const prompt = buildPostImagePrompt('[friends] A front-camera group selfie of the poster and two friends looking down into the phone screen taking the shot', 'Yokohama, Japan')
    expect(prompt).not.toContain('A screenshot saved on a phone')
    expect(prompt).toContain('group selfie')
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
    expect(prompt).toContain('Skin: smooth and soft, the way a phone renders')
    expect(prompt).toContain('sets in the west')
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

describe('lens for a shot', () => {
  it('picks the phone camera the description implies', async () => {
    const { lensForShot } = await import('@/server/operator-avatars/photo-realism')
    expect(lensForShot('A front-camera selfie at a café window')).toBe('front')
    expect(lensForShot('A mirror selfie in a hair salon')).toBe('main')
    expect(lensForShot('A friend took it standing a few steps away')).toBe('zoom')
    expect(lensForShot('A friend took it across the table at a barbecue place')).toBe('main')
    expect(lensForShot('Haeundae beach in the evening')).toBe('main')
  })
})

describe('off-color background objects', () => {
  it('reads the kind of place from the description', async () => {
    const { sceneKindOf } = await import('@/server/operator-avatars/photo-realism')
    expect(sceneKindOf('sitting on stone steps by the river under cherry blossoms')).toBe('nature')
    expect(sceneKindOf('a window table at a bright Seongsu café')).toBe('eatery')
    expect(sceneKindOf('lying on a bed, phone held above the face')).toBe('home')
    expect(sceneKindOf('walking down a Seongsu-dong street')).toBe('street')
    expect(sceneKindOf('Setting: on a train or subway, consistent with Seoul')).toBe('transit')
  })

  it('bans traffic cones and bins, never adds one, and often adds nothing', async () => {
    const { phonePhotoRealism } = await import('@/server/operator-avatars/photo-realism')
    let none = 0
    for (let seed = 1; seed <= 40; seed += 1) {
      let x = seed
      const random = () => ((x = (x * 9301 + 49297) % 233280) / 233280)
      const block = phonePhotoRealism(random, { people: true, environment: 'outdoor', scene: 'a riverside park under cherry blossoms' })
      expect(block).toContain('No traffic cones and no trash, recycling or rubbish bins')
      expect(block.match(/Somewhere in the background[^.]*\./)?.[0] ?? '').not.toMatch(/cone|bin\b/i)
      if (block.includes('Add no stray objects')) none += 1
    }
    expect(none).toBeGreaterThan(5)
  })
})

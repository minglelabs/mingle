import { describe, expect, it } from 'vitest'
import { buildPostImagePrompt } from './post-image'
import { BARE_FACE, CAMERA_DISTANCES, EXPRESSIONS, FEMALE_HAIRSTYLES, HEAD_ANGLES, PLAIN_LIGHT, pickPersonVariety } from './post-person-variety'

describe('variety in photos of the poster', () => {
  it('names a head angle, expression, hairstyle, outfit and light for a woman\'s selfie', () => {
    const prompt = buildPostImagePrompt('[self] the poster at a café window', 'Seoul, South Korea', () => 0.3, { look: 'x', hasReference: true, gender: 'female' })
    expect(prompt).toContain('Head angle in this photo, unlike the attached photo, unless the description already says:')
    expect(prompt).toContain('Expression in this photo, unless the description already says:')
    expect(prompt).toContain('Hairstyle today, unlike the attached photo, unless the description already says:')
    expect(prompt).toContain('Outfit today')
    expect(prompt).toContain('Light on the face')
    expect(prompt).toContain('Camera distance')
  })

  it('takes the poster from very close to far away, and never face-filling without a face', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 200; i += 1) {
      const value = i / 200
      const line = pickPersonVariety(() => value, { faces: true, female: false, hasReference: false }).at(-1)!
      seen.add(line)
    }
    expect(seen.size).toBe(CAMERA_DISTANCES.length)
    for (let i = 0; i < 50; i += 1) {
      const value = i / 50
      expect(pickPersonVariety(() => value, { faces: false, female: false, hasReference: false }).at(-1)).not.toContain('the face fills')
    }
  })

  it('leaves the hairstyle to men and the face picks to photos without a face', () => {
    expect(pickPersonVariety(() => 0, { faces: true, female: false, hasReference: true }).join('\n')).not.toContain('Hairstyle')
    const back = pickPersonVariety(() => 0, { faces: false, female: true, hasReference: true }).join('\n')
    expect(back).not.toContain('Head angle')
    expect(back).toContain('Hairstyle')
  })

  it('spreads across every option', () => {
    const seen = new Set<string>()
    for (let i = 0; i < HEAD_ANGLES.length; i += 1) {
      const value = (i + 0.5) / HEAD_ANGLES.length
      seen.add(pickPersonVariety(() => value, { faces: true, female: true, hasReference: false })[0])
    }
    expect(seen.size).toBe(HEAD_ANGLES.length)
    expect(EXPRESSIONS.length).toBeGreaterThan(5)
    expect(FEMALE_HAIRSTYLES.length).toBeGreaterThan(5)
  })

  it('sometimes, not always, asks for plain light and a bare face, only when the face shows', () => {
    let seed = 7
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    let plain = 0
    let bare = 0
    for (let i = 0; i < 1000; i += 1) {
      const text = pickPersonVariety(random, { faces: true, female: true, hasReference: true }).join('\n')
      if (text.includes(PLAIN_LIGHT)) plain += 1
      if (text.includes(BARE_FACE)) bare += 1
    }
    expect(plain).toBeGreaterThan(300)
    expect(plain).toBeLessThan(500)
    expect(bare).toBeGreaterThan(300)
    expect(bare).toBeLessThan(500)
    for (let i = 0; i < 50; i += 1) {
      const text = pickPersonVariety(random, { faces: false, female: true, hasReference: true }).join('\n')
      expect(text).not.toContain(BARE_FACE)
      expect(text).not.toContain(PLAIN_LIGHT)
    }
  })
})

import { describe, expect, it } from 'vitest'
import { buildPostImagePrompt } from './post-image'
import { EXPRESSIONS, FEMALE_HAIRSTYLES, HEAD_ANGLES, pickPersonVariety } from './post-person-variety'

describe('variety in photos of the poster', () => {
  it('names a head angle, expression, hairstyle, outfit and light for a woman\'s selfie', () => {
    const prompt = buildPostImagePrompt('[self] the poster at a café window', 'Seoul, South Korea', () => 0.3, { look: 'x', hasReference: true, gender: 'female' })
    expect(prompt).toContain('Head angle in this photo, unlike the attached photo:')
    expect(prompt).toContain('Expression in this photo:')
    expect(prompt).toContain('Hairstyle today, unlike the attached photo:')
    expect(prompt).toContain('Outfit today')
    expect(prompt).toContain('Light on the face')
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
})

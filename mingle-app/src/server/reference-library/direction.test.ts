import { describe, expect, it } from 'vitest'
import { referenceDirectionLines, referencePersonaLine, referenceSeasonClashes, referenceSeasonsToAvoid } from './direction'
import { referenceRecreateLines } from './library'

describe('referenceDirectionLines', () => {
  it('turns the analysis into direction lines, flaws included', () => {
    const lines = referenceDirectionLines({
      shooter: 'mirror_selfie', distance: 'full', angle: 'high', sharpness: 'slight_shake', exposure: 'dark', grain: 'heavy_noise',
      lighting: 'warm_lamp', timeOfDay: 'night', mood: 'sleepy late night', flaws: 'finger at the corner',
      people: [{ pose: 'leaning on the sink', expression: 'half smile', gaze: 'at the phone screen' }],
    }).join('\n')
    expect(lines).toContain('a mirror selfie')
    expect(lines).toContain('slightly blurred from hand shake')
    expect(lines).toContain('underexposed')
    expect(lines).toContain('finger at the corner')
    expect(lines).toContain("The person's pose: leaning on the sink")
  })

  it('is empty without an analysis', () => {
    expect(referenceDirectionLines(null)).toEqual([])
  })
})

describe('referenceRecreateLines with a persona', () => {
  it('keeps the direction and takes the style and place from the persona', () => {
    const persona = referencePersonaLine({ gender: 'female', name: null, age: 27, country: 'KR', countryName: 'South Korea', city: 'Busan', bio: '빵 좋아함' })
    const text = referenceRecreateLines({ kind: 'face', look: 'a woman', persona, direction: ['Direction of the reference shot, to reproduce exactly:', '- Shot: a selfie.'] }).join('\n')
    expect(text).toContain('27 years old, a woman, living in Busan, South Korea')
    expect(text).toContain('in their own style')
    expect(text).not.toContain('the hairstyle, the outfit and accessories, the place')
    expect(text).toContain('- Shot: a selfie.')
  })
})

describe('referenceSeasonsToAvoid', () => {
  it('skips summer photos in a northern November and winter ones in the south', () => {
    const november = new Date('2026-11-24T12:00:00Z')
    expect(referenceSeasonsToAvoid('KR', november)).toEqual(['summer'])
    expect(referenceSeasonsToAvoid('AU', november)).toEqual(['winter'])
    expect(referenceSeasonsToAvoid('TH', november)).toEqual(['winter'])
  })

  it('treats snow as winter and untagged photos as fitting', () => {
    expect(referenceSeasonClashes({ weather: 'snow' }, ['winter'])).toBe(true)
    expect(referenceSeasonClashes({ season: 'summer' }, ['summer'])).toBe(true)
    expect(referenceSeasonClashes({ season: 'unknown' }, ['summer'])).toBe(false)
    expect(referenceSeasonClashes(null, ['summer'])).toBe(false)
  })
})

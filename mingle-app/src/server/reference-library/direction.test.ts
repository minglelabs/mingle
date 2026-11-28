import { describe, expect, it } from 'vitest'
import { WIDE_POST_DISTANCE, widenPostShot, referenceAgeRange, referenceCountries, referenceDirectionLines, referencePersonaFit, referencePersonaLine, referenceSeasonClashes, referenceSeasonsToAvoid } from './direction'
import { referenceRecreateLines } from './library'
import { parseReferenceAttributes } from './classify'
import { pickSeedCountry } from '@/server/operators/seed-plan'

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
  it('changes only the face and visible body, keeping everything else', () => {
    const persona = referencePersonaLine({ gender: 'female', name: null, age: 27, country: 'KR', countryName: 'South Korea', city: 'Busan', bio: '빵 좋아함' })
    const text = referenceRecreateLines({ kind: 'face', look: 'a woman', persona, direction: ['Direction of the reference shot, to reproduce exactly:', '- Shot: a selfie.'] }).join('\n')
    expect(text).toContain('27 years old, a woman, living in Busan, South Korea')
    expect(text).toMatch(/change only the person's face, and the skin tone and build/)
    expect(text).toMatch(/hairstyle and hair color, the clothes/)
    expect(text).toContain('- Shot: a selfie.')
  })
})

describe('referencePersonaFit', () => {
  const twenties = { people: [{ age: 'early_20s' as const, ancestry: 'east_asian' as const }] }
  it('keeps a young East Asian photo from a 50-year-old or a Brazilian persona', () => {
    expect(referencePersonaFit(twenties, { age: 22, country: 'KR' }, 'face')).toBe('match')
    expect(referencePersonaFit(twenties, { age: 52, country: 'KR' }, 'face')).toBe('mismatch')
    expect(referencePersonaFit(twenties, { age: 23, country: 'BR' }, 'face')).toBe('mismatch')
    expect(referencePersonaFit(null, { age: 52, country: 'KR' }, 'face')).toBe('unknown')
    expect(referencePersonaFit(twenties, { age: 52, country: 'BR' }, 'thing')).toBe('match')
  })

  it('gives a new account the photo person\'s age range and countries', () => {
    expect(referenceAgeRange({ people: [{ age: '40s' }] })).toEqual({ min: 40, max: 49 })
    expect(referenceCountries(twenties)).toEqual(['KR', 'JP', 'TW', 'CN'])
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

describe('widenPostShot', () => {
  const base = { distance: 'chest', shooter: 'friend', layout: 'single' } as unknown as Parameters<typeof widenPostShot>[0]
  it('pulls a close shot back most of the time, a waist-up one half the time', () => {
    expect(widenPostShot(base, () => 0.8)).toBe(true)
    expect(widenPostShot(base, () => 0.9)).toBe(false)
    expect(widenPostShot({ ...base!, distance: 'waist' } as typeof base, () => 0.4)).toBe(true)
    expect(widenPostShot({ ...base!, distance: 'waist' } as typeof base, () => 0.6)).toBe(false)
  })
  it('never moves a far shot, a selfie, a photo booth or a collage', () => {
    expect(widenPostShot({ ...base!, distance: 'knees' } as typeof base, () => 0)).toBe(false)
    expect(widenPostShot({ ...base!, shooter: 'selfie' } as typeof base, () => 0)).toBe(false)
    expect(widenPostShot({ ...base!, layout: 'collage' } as typeof base, () => 0)).toBe(false)
  })
  it('says the knees-up distance in the shot line instead of the original', () => {
    expect(referenceDirectionLines(base, { distance: WIDE_POST_DISTANCE }).join('\n')).toContain('from the knees up')
  })
})

describe('referenceRecreateLines widen', () => {
  it('drops the keep-the-distance rule and asks for a wider shot', () => {
    const lines = referenceRecreateLines({ kind: 'face', look: 'a woman in her 20s', widen: true }).join('\n')
    expect(lines).toContain('from about the knees up')
    expect(lines).not.toContain('the camera angle and distance')
    const kept = referenceRecreateLines({ kind: 'face', look: 'a woman in her 20s' }).join('\n')
    expect(kept).toContain('the camera angle and distance')
  })
})

describe('the country a reference photo suits (staff 2026-11-28)', () => {
  it('takes the country read from the photo over the look alone', () => {
    expect(referenceCountries({ people: [{ ancestry: 'east_asian', country: 'JP' }] })).toEqual(['JP'])
    expect(referenceCountries({ people: [{ ancestry: 'east_asian' }] })).toEqual(['KR', 'JP', 'TW', 'CN'])
    expect(parseReferenceAttributes({ people: [{ country: 'tw', age: '30s' }] })?.people?.[0]).toEqual({ country: 'TW', age: '30s' })
    expect(parseReferenceAttributes({ people: [{ country: 'XX' }] })?.people?.[0]?.country).toBeUndefined()
  })

  it('draws a new account\'s country by the plan\'s shares, not the one furthest behind', () => {
    const counts = new Map<string, number>()
    let seed = 1
    const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
    for (let index = 0; index < 5000; index += 1) {
      const code = pickSeedCountry(null, random)
      counts.set(code, (counts.get(code) ?? 0) + 1)
    }
    const kr = (counts.get('KR') ?? 0) / 5000
    expect(kr).toBeGreaterThan(0.25)
    expect(kr).toBeLessThan(0.4)
    expect(counts.get('JP') ?? 0).toBeGreaterThan(800)
    expect(counts.size).toBeGreaterThan(15)
    expect(pickSeedCountry(['JP', 'TW'], () => 0.99)).toBe('TW')
    expect(pickSeedCountry(['ZZ'], random)).toBe('ZZ')
  })
})

import { describe, expect, it } from 'vitest'
import { pickPostPhoto } from '@/server/operator-post-reserve/post-photo'
import { pickMirrorSelfie } from './mirror-places'

describe('mirror selfies', () => {
  it('are taken in many places, mostly outside the home, and mostly not head to toe', () => {
    const places = new Set<string>()
    let home = 0
    let full = 0
    for (let index = 0; index < 2000; index += 1) {
      const { place, framing } = pickMirrorSelfie()
      places.add(place[0])
      if (place[0].startsWith('home_')) home += 1
      if (framing[0] === 'full') full += 1
    }
    expect(places.size).toBeGreaterThan(15)
    expect(home / 2000).toBeLessThan(0.25)
    expect(full / 2000).toBeLessThan(0.2)
  })

  it('fills the mirror setup of a post photo with a place', () => {
    let mirrors = 0
    for (let index = 0; index < 3000; index += 1) {
      const plan = pickPostPhoto(Math.random)
      expect(plan.setup ?? '').not.toMatch(/^</)
      if (/mirror selfie/.test(plan.setup ?? '')) mirrors += 1
    }
    expect(mirrors).toBeGreaterThan(0)
  })
})

describe('photos of the poster from behind', () => {
  it('never look into a shop window', () => {
    for (let index = 0; index < 3000; index += 1) {
      const plan = pickPostPhoto(Math.random)
      if (plan.kind === 'self_back') expect(plan.setup ?? '').not.toMatch(/shop window/)
    }
  })
})

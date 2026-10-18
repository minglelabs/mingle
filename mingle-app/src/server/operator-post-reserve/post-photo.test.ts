import { describe, expect, it } from 'vitest'
import { decodePostPhoto, encodePostPhoto, pickPostPhoto, POST_PHOTO_KINDS } from './post-photo'
import { seededRandom } from '@/server/operator-avatars/taxonomy'

describe('post photo kinds', () => {
  it('puts the poster in most photos, each with a setup', () => {
    const random = seededRandom('post-photo-test')
    const plans = Array.from({ length: 400 }, () => pickPostPhoto(random))
    const withPoster = plans.filter((plan) => plan.kind !== 'scene')
    expect(withPoster.length / plans.length).toBeGreaterThan(0.55)
    expect(withPoster.every((plan) => plan.setup)).toBe(true)
    expect(new Set(plans.map((plan) => plan.kind)).size).toBe(POST_PHOTO_KINDS.length)
  })

  it('round-trips the kind through the stored description', () => {
    expect(decodePostPhoto(encodePostPhoto('friends', 'three friends at a table'))).toEqual({ kind: 'friends', description: 'three friends at a table' })
    expect(encodePostPhoto('scene', 'a street')).toBe('a street')
    expect(decodePostPhoto('a street').kind).toBe('scene')
  })
})

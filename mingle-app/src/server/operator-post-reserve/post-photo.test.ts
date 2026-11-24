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
    expect(decodePostPhoto(encodePostPhoto('friends', 'three friends at a table'))).toEqual({ kind: 'friends', description: 'three friends at a table', place: null, profilePhoto: false })
    expect(encodePostPhoto('scene', 'a street')).toBe('a street')
    expect(decodePostPhoto('a street').kind).toBe('scene')
  })

  it('keeps the place of a photo taken away from home', () => {
    expect(encodePostPhoto('self', 'by the palace gate', 'Seoul, South Korea')).toBe('[self] [at: Seoul, South Korea] by the palace gate')
    expect(decodePostPhoto('[self] [at: Seoul, South Korea] by the palace gate')).toEqual({ kind: 'self', description: 'by the palace gate', place: 'Seoul, South Korea', profilePhoto: false })
    expect(decodePostPhoto('[at: Busan, South Korea] a beach')).toEqual({ kind: 'scene', description: 'a beach', place: 'Busan, South Korea', profilePhoto: false })
    expect(decodePostPhoto(encodePostPhoto('self', '(the profile photo) a clear photo of them smiling'))).toEqual({ kind: 'self', description: 'a clear photo of them smiling', place: null, profilePhoto: true })
  })
})

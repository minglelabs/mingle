import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('./profile-bio', () => ({ getPublishedBioText: async (_id: string, bio: string | null) => bio }))

import { calculateProfileAge, serializeUserProfile, userProfileSelect } from './user-profile'

const row = {
  id: 'u1', name: 'Mingle', image: null, imageObjectKey: null,
  imageCropScale: null, imageCropX: null, imageCropY: null, handle: 'mingle_team', bio: null,
  birthDate: null, nationality: null, primaryLanguages: [], defaultConversationLanguages: [],
  locationLatitude: null, locationLongitude: null, locationCity: null, locationCountry: null, locationCountryCode: null,
  _count: { followerRelations: 0, followingRelations: 0 },
}

describe('serializeUserProfile – official flag (own profile / my page)', () => {
  it('selects the column and passes true through', () => {
    expect(userProfileSelect.isOfficial).toBe(true)
    expect(serializeUserProfile({ ...row, isOfficial: true }).isOfficial).toBe(true)
  })

  it('omits the flag for a regular account', () => {
    expect(serializeUserProfile({ ...row, isOfficial: false })).not.toHaveProperty('isOfficial')
    expect(serializeUserProfile(row)).not.toHaveProperty('isOfficial')
  })
})




describe('public profile age', () => {
  it('selects a birth date, sends only the calculated age, and omits unavailable ages', () => {
    expect(userProfileSelect.birthDate).toBe(true)
    const profile = serializeUserProfile(
      { ...row, birthDate: new Date('1990-10-01T00:00:00.000Z') },
      new Date('2026-09-30T12:00:00.000Z'),
    )
    expect(profile.age).toBe(35)
    expect(profile).not.toHaveProperty('birthDate')

    for (const birthDate of [null, undefined, new Date('invalid'), new Date('2027-01-01T00:00:00.000Z')]) {
      const unavailable = serializeUserProfile({ ...row, birthDate }, new Date('2026-09-30T12:00:00.000Z'))
      expect(unavailable).not.toHaveProperty('age')
      expect(unavailable).not.toHaveProperty('birthDate')
    }
  })

  it('changes age on the birthday, including leap-day birthdays', () => {
    const birthday = new Date('2000-03-01T00:00:00.000Z')
    expect(calculateProfileAge(birthday, new Date('2026-02-28T23:59:59.000Z'))).toBe(25)
    expect(calculateProfileAge(birthday, new Date('2026-03-01T00:00:00.000Z'))).toBe(26)

    const leapBirthday = new Date('2000-02-29T00:00:00.000Z')
    expect(calculateProfileAge(leapBirthday, new Date('2023-02-28T00:00:00.000Z'))).toBe(22)
    expect(calculateProfileAge(leapBirthday, new Date('2023-03-01T00:00:00.000Z'))).toBe(23)
    expect(calculateProfileAge(leapBirthday, new Date('2024-02-28T00:00:00.000Z'))).toBe(23)
    expect(calculateProfileAge(leapBirthday, new Date('2024-02-29T00:00:00.000Z'))).toBe(24)
  })
})

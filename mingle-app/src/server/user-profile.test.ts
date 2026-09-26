import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('./profile-bio', () => ({ getPublishedBioText: async (_id: string, bio: string | null) => bio }))

import { serializeUserProfile, userProfileSelect } from './user-profile'

const row = {
  id: 'u1', name: 'Mingle', image: null, imageObjectKey: null,
  imageCropScale: null, imageCropX: null, imageCropY: null, handle: 'mingle_team', bio: null,
  nationality: null, primaryLanguages: [], defaultConversationLanguages: [],
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

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  userFindMany: vi.fn(),
  followFindMany: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique, findMany: mocks.userFindMany },
    userFollow: { findMany: mocks.followFindMany },
  },
}))

import { CONTACT_MATCH_MAX_HASHES, matchContactHashes, parseContactHashes } from './contact-match'

const h = (char: string) => char.repeat(64)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.userFindUnique.mockResolvedValue({ phoneVerifiedAt: new Date(), phoneHash: h('f') })
  mocks.userFindMany.mockResolvedValue([])
  mocks.followFindMany.mockResolvedValue([])
})

describe('matchContactHashes', () => {
  it('answers which hashed numbers are accounts, with follow state', async () => {
    mocks.userFindMany.mockResolvedValue([
      { id: 'u1', name: 'Yuki', handle: 'yuki', image: null, phoneHash: h('a') },
      { id: 'u2', name: 'Minji', handle: 'minji', image: 'https://img/2', phoneHash: h('b') },
    ])
    mocks.followFindMany.mockResolvedValue([{ followingId: 'u2' }])
    await expect(matchContactHashes('me', [h('a'), h('B'), h('c'), 'junk'])).resolves.toEqual([
      { hash: h('a'), userId: 'u1', name: 'Yuki', handle: 'yuki', image: null, isFollowing: false },
      { hash: h('b'), userId: 'u2', name: 'Minji', handle: 'minji', image: 'https://img/2', isFollowing: true },
    ])
    const where = mocks.userFindMany.mock.calls[0][0].where
    expect(where.phoneHash).toEqual({ in: [h('a'), h('b'), h('c')] })
    expect(where).toMatchObject({ isActive: true, isDeleted: false, isOperator: false, id: { not: 'me' } })
    expect(where.blockingRelations).toEqual({ none: { blockedId: 'me' } })
  })

  it('needs a verified number of the asker, and caps one request', async () => {
    mocks.userFindUnique.mockResolvedValueOnce({ phoneVerifiedAt: null, phoneHash: null })
    await expect(matchContactHashes('me', [h('a')])).rejects.toMatchObject({ code: 'phone_not_verified' })
    await expect(matchContactHashes('me', Array.from({ length: CONTACT_MATCH_MAX_HASHES + 1 }, () => h('a'))))
      .rejects.toMatchObject({ code: 'too_many_hashes' })
  })

  it('never looks up the asker’s own number or garbage', async () => {
    await expect(matchContactHashes('me', [h('f'), 'x'])).resolves.toEqual([])
    expect(mocks.userFindMany).not.toHaveBeenCalled()
    expect(parseContactHashes('nope')).toEqual([])
  })
})

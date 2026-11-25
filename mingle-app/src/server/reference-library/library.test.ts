import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => ({
  value: { items: [] as unknown[] } as unknown,
  reserves: [] as Array<{ imageObjectKey: string; state: string; postId?: string }>,
  deletedPosts: [] as string[],
  users: [] as Array<{ id: string; operatorAccount?: { avatarSpec: unknown } }>,
}))

vi.mock('@/lib/prisma', () => {
  const tx = {
    adminSetting: {
      upsert: async () => ({}),
      findUnique: async () => ({ value: store.value }),
      update: async ({ data }: { data: { value: unknown } }) => { store.value = data.value; return {} },
    },
    $queryRaw: async () => [],
    operatorPostReserve: { findMany: async () => store.reserves },
    user: { findMany: async () => store.users },
    post: { findMany: async () => store.deletedPosts.map((id) => ({ id })) },
  }
  return { prisma: { ...tx, $transaction: async (fn: (client: typeof tx) => unknown) => fn(tx) } }
})
vi.mock('@/server/posts/post-image-storage', () => ({ putPostImage: vi.fn(), getPostImage: vi.fn(), deletePostImage: vi.fn(async () => {}) }))

import { claimReferencePhoto, listReferencePhotos, markReferenceImage, releaseAbandonedReferences, releaseReferenceForImage, releaseReferencePhoto, removeReferencePhoto } from './library'

function photo(id: string, gender: string | null, used = false) {
  return { id, objectKey: `post-images/reference-library/${id}.jpg`, width: 10, height: 10, gender, createdAt: '2026-11-24T00:00:00.000Z', usedBy: used ? { userId: 'u0', kind: 'avatar', at: 'x' } : null }
}

describe('reference library', () => {
  beforeEach(() => {
    // Newest first, as uploads are prepended.
    store.value = { items: [photo('new-f', 'female'), photo('any', null), photo('old-m', 'male'), photo('old-f', 'female'), photo('used-f', 'female', true)] }
  })

  it('claims the oldest unused photo of the gender, then untagged, once each', async () => {
    expect((await claimReferencePhoto({ userId: 'u1', kind: 'avatar', gender: 'female' }))?.id).toBe('old-f')
    expect((await claimReferencePhoto({ userId: 'u2', kind: 'avatar', gender: 'female' }))?.id).toBe('new-f')
    expect((await claimReferencePhoto({ userId: 'u3', kind: 'post', gender: 'female' }))?.id).toBe('any')
    expect(await claimReferencePhoto({ userId: 'u4', kind: 'post', gender: 'female' })).toBeNull()
    const used = (await listReferencePhotos()).find((item) => item.id === 'any')
    expect(used?.usedBy).toMatchObject({ userId: 'u3', kind: 'post' })
  })

  it('claims a named photo only while unused, and a released one can be claimed again', async () => {
    expect(await claimReferencePhoto({ userId: 'u1', kind: 'avatar', id: 'used-f' })).toBeNull()
    expect((await claimReferencePhoto({ userId: 'u1', kind: 'avatar', id: 'old-m' }))?.id).toBe('old-m')
    await releaseReferencePhoto('old-m')
    expect((await claimReferencePhoto({ userId: 'u2', kind: 'avatar', gender: 'male' }))?.id).toBe('old-m')
    expect(await removeReferencePhoto('old-m')).toBe(true)
    expect((await listReferencePhotos()).some((item) => item.id === 'old-m')).toBe(false)
  })
})

describe('reference kinds', () => {
  it('claims only the kinds asked for, an untagged photo counting as a face photo', async () => {
    store.value = { items: [
      { ...photo('food', null), kind: 'thing' },
      { ...photo('back', 'female'), kind: 'person' },
      photo('legacy', 'female'),
    ] }
    expect((await claimReferencePhoto({ userId: 'u1', kind: 'post', kinds: ['thing'] }))?.id).toBe('food')
    expect(await claimReferencePhoto({ userId: 'u1', kind: 'post', kinds: ['thing'] })).toBeNull()
    expect((await claimReferencePhoto({ userId: 'u1', kind: 'post', kinds: ['face'], gender: 'female' }))?.id).toBe('legacy')
    expect((await claimReferencePhoto({ userId: 'u1', kind: 'post', kinds: ['person'], gender: 'male' }))).toBeNull()
  })
})

describe('the post photo drawn from a library photo', () => {
  it('stays recorded across later writes of the library', async () => {
    store.value = { items: [photo('a', 'female'), photo('b', 'female')] }
    await claimReferencePhoto({ userId: 'u1', kind: 'post', id: 'a' })
    await markReferenceImage('a', 'post-images/u1/x.jpg')
    await claimReferencePhoto({ userId: 'u2', kind: 'post', id: 'b' })
    expect((await listReferencePhotos()).find((item) => item.id === 'a')?.usedBy?.imageKey).toBe('post-images/u1/x.jpg')
  })
})

describe('releaseAbandonedReferences', () => {
  it('frees photos whose post was deleted unpublished or redrawn, or whose account is gone, and keeps the rest', async () => {
    const old = '2026-11-25T00:00:00.000Z'
    const use = (kind: string, userId: string, imageKey?: string, at = old) => ({ userId, kind, at, ...(imageKey ? { imageKey } : {}) })
    store.value = { items: [
      { ...photo('published', 'female'), usedBy: use('post', 'u1', 'k-published') },
      { ...photo('published-deleted', 'female'), usedBy: use('post', 'u1', 'k-published-deleted') },
      { ...photo('deleted', 'female'), usedBy: use('post', 'u1', 'k-deleted') },
      { ...photo('redrawn', 'female'), usedBy: use('post', 'u1', 'k-redrawn') },
      { ...photo('fresh', 'female'), usedBy: use('post', 'u1', 'k-fresh', '2026-11-25T11:55:00.000Z') },
      { ...photo('live-avatar', 'female'), usedBy: use('avatar', 'u2') },
      { ...photo('gone-avatar', 'female'), usedBy: use('avatar', 'u3') },
      { ...photo('redrawn-avatar', 'female'), usedBy: use('avatar', 'u4') },
    ] }
    store.reserves = [
      { imageObjectKey: 'k-published', state: 'published', postId: 'p1' },
      { imageObjectKey: 'k-published-deleted', state: 'published', postId: 'p2' },
      { imageObjectKey: 'k-deleted', state: 'cancelled' },
    ]
    store.deletedPosts = ['p2']
    store.users = [
      { id: 'u2', operatorAccount: { avatarSpec: { attributes: { source: 'reference_library' } } } },
      { id: 'u4', operatorAccount: { avatarSpec: { attributes: { source: 'taxonomy' } } } },
    ]
    expect(await releaseAbandonedReferences(new Date('2026-11-25T12:00:00.000Z'))).toBe(5)
    const used = (await listReferencePhotos()).filter((item) => item.usedBy).map((item) => item.id)
    expect(used).toEqual(['published', 'fresh', 'live-avatar'])
  })

  it('puts back the photo of a post staff deleted, right away', async () => {
    store.value = { items: [
      { ...photo('drawn', 'female'), usedBy: { userId: 'u1', kind: 'post', at: new Date().toISOString(), imageKey: 'k1' } },
      { ...photo('other', 'female'), usedBy: { userId: 'u1', kind: 'post', at: new Date().toISOString(), imageKey: 'k2' } },
    ] }
    await releaseReferenceForImage('k1')
    expect((await listReferencePhotos()).filter((item) => item.usedBy).map((item) => item.id)).toEqual(['other'])
  })
})

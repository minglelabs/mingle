import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => ({ value: { items: [] as unknown[] } as unknown }))

vi.mock('@/lib/prisma', () => {
  const tx = {
    adminSetting: {
      upsert: async () => ({}),
      findUnique: async () => ({ value: store.value }),
      update: async ({ data }: { data: { value: unknown } }) => { store.value = data.value; return {} },
    },
    $queryRaw: async () => [],
  }
  return { prisma: { ...tx, $transaction: async (fn: (client: typeof tx) => unknown) => fn(tx) } }
})
vi.mock('@/server/posts/post-image-storage', () => ({ putPostImage: vi.fn(), getPostImage: vi.fn(), deletePostImage: vi.fn(async () => {}) }))

import { claimReferencePhoto, listReferencePhotos, markReferenceImage, releaseReferencePhoto, removeReferencePhoto } from './library'

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

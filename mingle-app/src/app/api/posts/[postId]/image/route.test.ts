import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
  mockGetServerSession,
  mockPostFindFirst,
  mockPostUpdate,
  mockPostCount,
  mockDraftCount,
  mockGetPostImage,
  mockDeletePostImage,
  mockStoreUploadedPostImage,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockPostFindFirst: vi.fn(),
  mockPostUpdate: vi.fn(),
  mockPostCount: vi.fn(),
  mockDraftCount: vi.fn(),
  mockGetPostImage: vi.fn(),
  mockDeletePostImage: vi.fn(),
  mockStoreUploadedPostImage: vi.fn(),
}))

vi.mock('sharp', () => ({ default: vi.fn() }))
vi.mock('next-auth', () => ({ getServerSession: mockGetServerSession }))
vi.mock('@/lib/auth-options', () => ({ getAuthOptions: () => ({}) }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    post: { findFirst: mockPostFindFirst, update: mockPostUpdate, count: mockPostCount },
    postDraft: { count: mockDraftCount },
  },
}))
vi.mock('@/server/posts/post-image-upload', () => ({
  contentLengthTooLarge: () => false,
  storeUploadedPostImage: mockStoreUploadedPostImage,
}))
vi.mock('@/server/posts/post-image-storage', () => ({
  POST_IMAGE_MAX_BYTES: 10 * 1024 * 1024,
  getPostImage: mockGetPostImage,
  putPostImage: vi.fn(),
  deletePostImage: mockDeletePostImage,
}))

import { visibleSinglePostWhere } from '@/server/posts/post-visibility'
// Posting writes are gated on the moderation restriction; unrestricted here.
const { mockAccountRestrictionGuard } = vi.hoisted(() => ({
  mockAccountRestrictionGuard: vi.fn<(userId: string) => Promise<Response | null>>(async () => null),
}))
vi.mock('@/server/reports/account-restriction', () => ({
  accountRestrictionGuard: mockAccountRestrictionGuard,
}))

import { GET, POST } from './route'

const OWN_KEY = 'post-images/author-1/0f8fad5b-d9cb-469f-a165-70867728950e.jpg'

function context(postId: string) {
  return { params: Promise.resolve({ postId }) }
}

function request(postId: string) {
  return new NextRequest(`http://localhost/api/posts/${postId}/image`)
}

describe('GET /api/posts/{postId}/image', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetPostImage.mockResolvedValue(new Uint8Array([1, 2, 3]))
  })

  it('serves a public post image to a signed-out viewer', async () => {
    mockGetServerSession.mockResolvedValue(null)
    mockPostFindFirst.mockResolvedValue({ authorId: 'author-1', imageObjectKey: OWN_KEY })

    const response = await GET(request('p1'), context('p1'))

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/jpeg')
    expect(mockPostFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: visibleSinglePostWhere('p1', null) }),
    )
  })

  it('applies the signed-in viewer to the visibility rule, plus author and hider access', async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: ' u1 ' } })
    mockPostFindFirst.mockResolvedValue({ authorId: 'author-1', imageObjectKey: OWN_KEY })

    const response = await GET(request('p1'), context('p1'))

    expect(response.status).toBe(200)
    const where = mockPostFindFirst.mock.calls[0][0].where
    expect(where.OR[0]).toEqual(visibleSinglePostWhere('p1', 'u1'))
    // The author reads their own archived / trashed post image.
    expect(where.OR[1]).toEqual({ id: 'p1', authorId: 'u1', moderationHiddenAt: null })
    // A viewer who hid a still-viewable post reads it for the hidden-posts list.
    expect(where.OR[2]).toMatchObject({
      id: 'p1',
      visibility: 'public',
      moderationHiddenAt: null,
      hides: { some: { userId: 'u1' } },
    })
    expect(where.OR[2]).not.toHaveProperty('authorId')
  })

  it('serves the author their archived post image (archive tile)', async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: 'author-1' } })
    mockPostFindFirst.mockImplementation(async ({ where }: { where: { OR?: Array<Record<string, unknown>> } }) =>
      where.OR?.some((b) => b.authorId === 'author-1') ? { authorId: 'author-1', imageObjectKey: OWN_KEY } : null,
    )
    const response = await GET(request('p1'), context('p1'))
    expect(response.status).toBe(200)
    expect(mockGetPostImage).toHaveBeenCalledWith(OWN_KEY)
  })

  it('returns 404 when the post is not visible to the viewer', async () => {
    mockGetServerSession.mockResolvedValue(null)
    mockPostFindFirst.mockResolvedValue(null)

    const response = await GET(request('p1'), context('p1'))

    expect(response.status).toBe(404)
    expect(mockGetPostImage).not.toHaveBeenCalled()
  })

  it.each([
    ['a conversation image key', 'conversation-images/conv-1/0f8fad5b-d9cb-469f-a165-70867728950e.jpg'],
    ['a key issued to another user', 'post-images/someone-else/0f8fad5b-d9cb-469f-a165-70867728950e.jpg'],
  ])('never reads %s stored on a post', async (_label, key) => {
    mockGetServerSession.mockResolvedValue(null)
    mockPostFindFirst.mockResolvedValue({ authorId: 'author-1', imageObjectKey: key })

    const response = await GET(request('p1'), context('p1'))

    expect(response.status).toBe(404)
    expect(mockGetPostImage).not.toHaveBeenCalled()
  })
})

describe('POST /api/posts/{postId}/image', () => {
  const NEW_KEY = 'post-images/author-1/1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed.jpg'

  function upload(): NextRequest {
    const form = new FormData()
    form.append('file', new File(['x'], 'p.jpg', { type: 'image/jpeg' }))
    return new NextRequest('http://localhost/api/posts/p1/image', { method: 'POST', body: form })
  }

  async function settle() {
    await new Promise((r) => setTimeout(r, 0))
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetServerSession.mockResolvedValue({ user: { id: 'author-1' } })
    mockStoreUploadedPostImage.mockResolvedValue({ ok: true, image: { objectKey: NEW_KEY, width: 1, height: 1 } })
    mockPostUpdate.mockResolvedValue({})
    mockPostCount.mockResolvedValue(0)
    mockDraftCount.mockResolvedValue(0)
    mockDeletePostImage.mockResolvedValue(undefined)
  })

  it('stores under the author\'s prefix and deletes the replaced own image', async () => {
    mockPostFindFirst.mockResolvedValue({ id: 'p1', authorId: 'author-1', imageObjectKey: OWN_KEY })
    const res = await POST(upload(), context('p1'))
    await settle()
    expect(res.status).toBe(201)
    expect(mockStoreUploadedPostImage).toHaveBeenCalledWith(expect.any(FormData), 'author-1')
    expect(mockPostUpdate).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { imageObjectKey: NEW_KEY, imageWidth: 1, imageHeight: 1 },
    })
    expect(mockDeletePostImage).toHaveBeenCalledWith(OWN_KEY)
  })

  it('never deletes a foreign previous key (e.g. a conversation image)', async () => {
    mockPostFindFirst.mockResolvedValue({
      id: 'p1', authorId: 'author-1', imageObjectKey: 'conversation-images/conv-1/secret.jpg',
    })
    const res = await POST(upload(), context('p1'))
    await settle()
    expect(res.status).toBe(201)
    expect(mockDeletePostImage).not.toHaveBeenCalled()
  })

  it('keeps a replaced image that a draft still references', async () => {
    mockPostFindFirst.mockResolvedValue({ id: 'p1', authorId: 'author-1', imageObjectKey: OWN_KEY })
    mockDraftCount.mockResolvedValue(1)
    await POST(upload(), context('p1'))
    await settle()
    expect(mockDeletePostImage).not.toHaveBeenCalled()
  })
})

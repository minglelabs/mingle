import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { mockGetServerSession, mockDraftFindFirst, mockGetPostImage, mockStoreUploadedPostImage } = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockDraftFindFirst: vi.fn(),
  mockGetPostImage: vi.fn(),
  mockStoreUploadedPostImage: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession: mockGetServerSession }))
vi.mock('@/lib/auth-options', () => ({ getAuthOptions: () => ({}) }))
// Posting writes are gated on the moderation restriction; unrestricted here.
vi.mock('@/server/reports/account-restriction', () => ({ accountRestrictionGuard: async () => null }))
vi.mock('@/lib/prisma', () => ({ prisma: { postDraft: { findFirst: mockDraftFindFirst } } }))
vi.mock('@/server/posts/post-image-storage', () => ({ getPostImage: mockGetPostImage }))
vi.mock('@/server/posts/post-image-upload', () => ({
  contentLengthTooLarge: () => false,
  storeUploadedPostImage: mockStoreUploadedPostImage,
}))
vi.mock('@/server/rate-limit/rate-limit', () => ({ rateLimitGuard: () => null }))

import { GET, POST } from './route'

const OWN_KEY = 'post-images/user-1/0f8fad5b-d9cb-469f-a165-70867728950e.jpg'

function uploadRequest(): NextRequest {
  const form = new FormData()
  form.append('file', new File(['x'], 'p.jpg', { type: 'image/jpeg' }))
  return new NextRequest('http://localhost/api/posts/images', { method: 'POST', body: form })
}

describe('POST /api/posts/images', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } })
  })

  it('requires sign-in', async () => {
    mockGetServerSession.mockResolvedValue(null)
    expect((await POST(uploadRequest())).status).toBe(401)
    expect(mockStoreUploadedPostImage).not.toHaveBeenCalled()
  })

  it('stores the upload for the signed-in user and returns the issued key', async () => {
    mockStoreUploadedPostImage.mockResolvedValue({ ok: true, image: { objectKey: OWN_KEY, width: 10, height: 20 } })
    const res = await POST(uploadRequest())
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ imageObjectKey: OWN_KEY, width: 10, height: 20 })
    expect(mockStoreUploadedPostImage).toHaveBeenCalledWith(expect.any(FormData), 'user-1')
  })

  it('passes pipeline errors through', async () => {
    mockStoreUploadedPostImage.mockResolvedValue({ ok: false, status: 400, error: 'invalid_image' })
    const res = await POST(uploadRequest())
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid_image')
  })
})

describe('GET /api/posts/images?draftId=', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } })
    mockGetPostImage.mockResolvedValue(new Uint8Array([1]))
  })

  const get = (draftId: string) => GET(new NextRequest(`http://localhost/api/posts/images?draftId=${draftId}`))

  it('serves the owner\'s draft image', async () => {
    mockDraftFindFirst.mockResolvedValue({ imageObjectKey: OWN_KEY })
    const res = await get('d1')
    expect(res.status).toBe(200)
    expect(mockDraftFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'd1', authorId: 'user-1' } }))
    expect(mockGetPostImage).toHaveBeenCalledWith(OWN_KEY)
  })

  it('404s for another user\'s draft (scoped lookup finds nothing)', async () => {
    mockDraftFindFirst.mockResolvedValue(null)
    expect((await get('d-other')).status).toBe(404)
    expect(mockGetPostImage).not.toHaveBeenCalled()
  })

  it('never reads a foreign key stored on a draft', async () => {
    mockDraftFindFirst.mockResolvedValue({ imageObjectKey: 'conversation-images/conv-1/secret.jpg' })
    expect((await get('d1')).status).toBe(404)
    expect(mockGetPostImage).not.toHaveBeenCalled()
  })

  it('requires sign-in', async () => {
    mockGetServerSession.mockResolvedValue(null)
    expect((await get('d1')).status).toBe(401)
  })
})

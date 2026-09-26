import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { mockGetServerSession, mockPostFindFirst, mockGetPostImage } = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockPostFindFirst: vi.fn(),
  mockGetPostImage: vi.fn(),
}))

vi.mock('sharp', () => ({ default: vi.fn() }))
vi.mock('next-auth', () => ({ getServerSession: mockGetServerSession }))
vi.mock('@/lib/auth-options', () => ({ getAuthOptions: () => ({}) }))
vi.mock('@/lib/prisma', () => ({ prisma: { post: { findFirst: mockPostFindFirst } } }))
vi.mock('@/server/posts/post-image-storage', () => ({
  POST_IMAGE_MAX_BYTES: 10 * 1024 * 1024,
  getPostImage: mockGetPostImage,
  putPostImage: vi.fn(),
  deletePostImage: vi.fn(),
}))

import { visibleSinglePostWhere } from '@/server/posts/post-visibility'
// Posting writes are gated on the moderation restriction; unrestricted here.
const { mockAccountRestrictionGuard } = vi.hoisted(() => ({
  mockAccountRestrictionGuard: vi.fn<(userId: string) => Promise<Response | null>>(async () => null),
}))
vi.mock('@/server/reports/account-restriction', () => ({
  accountRestrictionGuard: mockAccountRestrictionGuard,
}))

import { GET } from './route'

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
    mockPostFindFirst.mockResolvedValue({ imageObjectKey: 'posts/p1.jpg' })

    const response = await GET(request('p1'), context('p1'))

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/jpeg')
    expect(mockPostFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: visibleSinglePostWhere('p1', null) }),
    )
  })

  it('applies the signed-in viewer to the visibility rule', async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: ' u1 ' } })
    mockPostFindFirst.mockResolvedValue({ imageObjectKey: 'posts/p1.jpg' })

    const response = await GET(request('p1'), context('p1'))

    expect(response.status).toBe(200)
    expect(mockPostFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: visibleSinglePostWhere('p1', 'u1') }),
    )
  })

  it('returns 404 when the post is not visible to the viewer', async () => {
    mockGetServerSession.mockResolvedValue(null)
    mockPostFindFirst.mockResolvedValue(null)

    const response = await GET(request('p1'), context('p1'))

    expect(response.status).toBe(404)
    expect(mockGetPostImage).not.toHaveBeenCalled()
  })
})

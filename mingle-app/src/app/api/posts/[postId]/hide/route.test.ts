import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
  mockGetServerSession,
  mockPostFindUnique,
  mockPostHideUpsert,
  mockPostHideDelete,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockPostFindUnique: vi.fn(),
  mockPostHideUpsert: vi.fn(),
  mockPostHideDelete: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession: mockGetServerSession }))
vi.mock('@/lib/auth-options', () => ({ getAuthOptions: () => ({}) }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    post: { findUnique: mockPostFindUnique },
    postHide: { upsert: mockPostHideUpsert, delete: mockPostHideDelete },
  },
}))

import { POST, DELETE } from './route'

const makeParams = (postId: string) => ({ params: Promise.resolve({ postId }) })

describe('POST /api/posts/[postId]/hide', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } })
  })

  it('hides a post', async () => {
    mockPostFindUnique.mockResolvedValue({ id: 'p1' })
    mockPostHideUpsert.mockResolvedValue({})

    const req = new NextRequest('http://localhost/api/posts/p1/hide', { method: 'POST' })
    const res = await POST(req, makeParams('p1'))
    expect(res.status).toBe(201)
  })

  it('returns 404 if post does not exist', async () => {
    mockPostFindUnique.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/posts/p1/hide', { method: 'POST' })
    const res = await POST(req, makeParams('p1'))
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/posts/[postId]/hide', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } })
  })

  it('unhides a post', async () => {
    mockPostHideDelete.mockResolvedValue({})

    const req = new NextRequest('http://localhost/api/posts/p1/hide', { method: 'DELETE' })
    const res = await DELETE(req, makeParams('p1'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.hidden).toBe(false)
  })
})

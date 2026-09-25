import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
  mockGetServerSession,
  mockPostFindFirst,
  mockPostUpdate,
  mockUserFindUnique,
  mockRetranslatePostOnEdit,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockPostFindFirst: vi.fn(),
  mockPostUpdate: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockRetranslatePostOnEdit: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession: mockGetServerSession }))
vi.mock('@/lib/auth-options', () => ({ getAuthOptions: () => ({}) }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    post: { findFirst: mockPostFindFirst, update: mockPostUpdate },
    user: { findUnique: mockUserFindUnique },
  },
}))
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return { ...actual, after: (fn: () => Promise<void>) => { fn().catch(() => {}) } }
})
vi.mock('@/server/translation/post-translation-service', () => ({
  retranslatePostOnEdit: mockRetranslatePostOnEdit,
}))
vi.mock('@/server/posts/post-translation-repository', () => ({
  prismaTranslationDeps: {},
}))

import { GET, PATCH, DELETE } from './route'

const makeParams = (postId: string) => ({ params: Promise.resolve({ postId }) })

describe('GET /api/posts/[postId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetServerSession.mockResolvedValue({ user: { id: 'viewer-1' } })
    mockUserFindUnique.mockResolvedValue({ defaultDisplayLanguage: 'ko' })
  })

  it('returns 401 if not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)
    const req = new NextRequest('http://localhost/api/posts/p1')
    const res = await GET(req, makeParams('p1'))
    expect(res.status).toBe(401)
  })

  it('returns 404 if post not visible', async () => {
    mockPostFindFirst.mockResolvedValue(null)
    const req = new NextRequest('http://localhost/api/posts/p1')
    const res = await GET(req, makeParams('p1'))
    expect(res.status).toBe(404)
  })

  it('returns post with translated text when available', async () => {
    mockPostFindFirst.mockResolvedValue({
      id: 'p1',
      sourceText: 'Hello',
      sourceLanguage: 'en',
      bodyVersion: 1,
      backgroundKey: 'solid-white',
      imageObjectKey: null,
      visibility: 'public',
      likeCount: 5,
      commentCount: 2,
      publishedAt: new Date(),
      author: { id: 'u1', handle: 'alice', name: 'Alice', image: null },
      translations: [
        { language: 'ko', bodyVersion: 1, text: '안녕하세요' },
        { language: 'ja', bodyVersion: 1, text: 'こんにちは' },
      ],
    })

    const req = new NextRequest('http://localhost/api/posts/p1')
    const res = await GET(req, makeParams('p1'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.displayText).toBe('안녕하세요')
    expect(json.displayLanguage).toBe('ko')
  })
})

describe('PATCH /api/posts/[postId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } })
    mockRetranslatePostOnEdit.mockResolvedValue({})
  })

  it('returns 404 if post does not belong to user', async () => {
    mockPostFindFirst.mockResolvedValue(null)
    const req = new NextRequest('http://localhost/api/posts/p1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceText: 'updated' }),
    })
    const res = await PATCH(req, makeParams('p1'))
    expect(res.status).toBe(404)
  })

  it('increments bodyVersion on text change', async () => {
    mockPostFindFirst.mockResolvedValue({
      id: 'p1', authorId: 'user-1', bodyVersion: 1, imageObjectKey: null,
    })
    mockPostUpdate.mockResolvedValue({
      id: 'p1', bodyVersion: 2, backgroundKey: 'solid-white', updatedAt: new Date(),
      sourceText: 'updated', sourceLanguage: 'en',
    })

    const req = new NextRequest('http://localhost/api/posts/p1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceText: 'updated' }),
    })
    const res = await PATCH(req, makeParams('p1'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.bodyVersion).toBe(2)
  })
})

describe('DELETE /api/posts/[postId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } })
  })

  it('soft-deletes the post', async () => {
    mockPostFindFirst.mockResolvedValue({ id: 'p1', authorId: 'user-1' })
    mockPostUpdate.mockResolvedValue({ id: 'p1', isDeleted: true })

    const req = new NextRequest('http://localhost/api/posts/p1', { method: 'DELETE' })
    const res = await DELETE(req, makeParams('p1'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.deleted).toBe(true)
    expect(mockPostUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ isDeleted: true }),
    }))
  })
})

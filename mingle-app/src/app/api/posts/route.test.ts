import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
  mockGetServerSession,
  mockPostCreate,
  mockPostFindFirst,
  mockTranslatePostOnPublish,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockPostCreate: vi.fn(),
  mockPostFindFirst: vi.fn(),
  mockTranslatePostOnPublish: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession: mockGetServerSession }))
vi.mock('@/lib/auth-options', () => ({ getAuthOptions: () => ({}) }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    post: { create: mockPostCreate, findFirst: mockPostFindFirst },
  },
}))
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return { ...actual, after: (fn: () => Promise<void>) => { fn().catch(() => {}) } }
})
vi.mock('@/server/translation/post-translation-service', () => ({
  translatePostOnPublish: mockTranslatePostOnPublish,
}))
vi.mock('@/server/posts/post-translation-repository', () => ({
  prismaTranslationDeps: {},
}))

import { POST } from './route'

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/posts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } })
    mockPostFindFirst.mockResolvedValue(null)
    mockTranslatePostOnPublish.mockResolvedValue({})
  })

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)
    const res = await POST(makeRequest({ sourceText: 'hi' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when no text and no image', async () => {
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('text_or_image_required')
  })

  it('returns 400 when text is whitespace only', async () => {
    const res = await POST(makeRequest({ sourceText: '   ' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when text exceeds 1000 chars', async () => {
    const res = await POST(makeRequest({ sourceText: 'a'.repeat(1001) }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('text_too_long')
  })

  it('creates a post and returns 201', async () => {
    mockPostCreate.mockResolvedValue({
      id: 'post-1',
      backgroundKey: 'solid-white',
      publishedAt: new Date(),
    })

    const res = await POST(makeRequest({
      sourceText: 'Hello world',
      sourceLanguage: 'en',
    }))
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.postId).toBe('post-1')
    expect(mockPostCreate).toHaveBeenCalledOnce()
  })

  it('returns existing post for duplicate clientPostId', async () => {
    mockPostFindFirst.mockResolvedValue({ id: 'post-dup' })

    const res = await POST(makeRequest({
      sourceText: 'Hello',
      sourceLanguage: 'en',
      clientPostId: 'post-dup',
    }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.duplicate).toBe(true)
    expect(mockPostCreate).not.toHaveBeenCalled()
  })

  it('allows image-only posts without text', async () => {
    mockPostCreate.mockResolvedValue({
      id: 'post-img',
      backgroundKey: 'solid-coral',
      publishedAt: new Date(),
    })

    const res = await POST(makeRequest({
      imageObjectKey: 'post-images/abc.jpg',
    }))
    expect(res.status).toBe(201)
  })
})

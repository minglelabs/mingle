import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
  mockGetServerSession,
  mockDraftFindMany,
  mockDraftCreate,
  mockDraftFindFirst,
  mockDraftUpdate,
  mockDraftDelete,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockDraftFindMany: vi.fn(),
  mockDraftCreate: vi.fn(),
  mockDraftFindFirst: vi.fn(),
  mockDraftUpdate: vi.fn(),
  mockDraftDelete: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession: mockGetServerSession }))
vi.mock('@/lib/auth-options', () => ({ getAuthOptions: () => ({}) }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    postDraft: {
      findMany: mockDraftFindMany,
      create: mockDraftCreate,
      findFirst: mockDraftFindFirst,
      update: mockDraftUpdate,
      delete: mockDraftDelete,
    },
  },
}))

// Posting writes are gated on the moderation restriction; unrestricted here.
const { mockAccountRestrictionGuard } = vi.hoisted(() => ({
  mockAccountRestrictionGuard: vi.fn<(userId: string) => Promise<Response | null>>(async () => null),
}))
vi.mock('@/server/reports/account-restriction', () => ({
  accountRestrictionGuard: mockAccountRestrictionGuard,
}))

import { GET, POST, PATCH, DELETE } from './route'

describe('POST /api/posts/drafts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } })
  })

  it('returns 403 account_restricted for a restricted account', async () => {
    mockAccountRestrictionGuard.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'account_restricted' }), { status: 403 }))
    const req = new NextRequest('http://localhost/api/posts/drafts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceText: 'hello' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(403)
    expect(mockDraftCreate).not.toHaveBeenCalled()
  })

  it('creates a draft', async () => {
    const draft = { id: 'd1', authorId: 'user-1', sourceText: 'hello', backgroundKey: null, imageObjectKey: null }
    mockDraftCreate.mockResolvedValue(draft)

    const req = new NextRequest('http://localhost/api/posts/drafts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceText: 'hello' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.draft.id).toBe('d1')
  })

  it('keeps a server-issued image key on the draft', async () => {
    mockDraftCreate.mockResolvedValue({ id: 'd2' })
    const req = new NextRequest('http://localhost/api/posts/drafts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceText: '', imageObjectKey: 'post-images/user-1/0f8fad5b-d9cb-469f-a165-70867728950e.jpg' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(201)
    expect(mockDraftCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ imageObjectKey: 'post-images/user-1/0f8fad5b-d9cb-469f-a165-70867728950e.jpg' }),
    })
  })

  it('rejects a conversation image key', async () => {
    const req = new NextRequest('http://localhost/api/posts/drafts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageObjectKey: 'conversation-images/conv-1/secret.jpg' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    expect(mockDraftCreate).not.toHaveBeenCalled()
  })
})

describe('GET /api/posts/drafts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } })
  })

  it('returns drafts list', async () => {
    mockDraftFindMany.mockResolvedValue([{ id: 'd1' }, { id: 'd2' }])

    const req = new NextRequest('http://localhost/api/posts/drafts')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.drafts).toHaveLength(2)
  })
})

describe('PATCH /api/posts/drafts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } })
  })

  it('updates a draft', async () => {
    mockDraftFindFirst.mockResolvedValue({ id: 'd1', authorId: 'user-1' })
    mockDraftUpdate.mockResolvedValue({ id: 'd1', sourceText: 'updated' })

    const req = new NextRequest('http://localhost/api/posts/drafts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draftId: 'd1', sourceText: 'updated' }),
    })
    const res = await PATCH(req)
    expect(res.status).toBe(200)
  })

  it('saves and clears the draft image by key', async () => {
    mockDraftFindFirst.mockResolvedValue({ id: 'd1', authorId: 'user-1' })
    mockDraftUpdate.mockResolvedValue({ id: 'd1' })
    for (const imageObjectKey of ['post-images/user-1/0f8fad5b-d9cb-469f-a165-70867728950e.jpg', null]) {
      const req = new NextRequest('http://localhost/api/posts/drafts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId: 'd1', imageObjectKey }),
      })
      expect((await PATCH(req)).status).toBe(200)
      expect(mockDraftUpdate).toHaveBeenLastCalledWith({ where: { id: 'd1' }, data: { imageObjectKey } })
    }
  })

  it('rejects another user\'s image key on update', async () => {
    mockDraftFindFirst.mockResolvedValue({ id: 'd1', authorId: 'user-1' })
    const req = new NextRequest('http://localhost/api/posts/drafts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draftId: 'd1', imageObjectKey: 'post-images/user-2/0f8fad5b-d9cb-469f-a165-70867728950e.jpg' }),
    })
    expect((await PATCH(req)).status).toBe(400)
    expect(mockDraftUpdate).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/posts/drafts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } })
  })

  it('deletes a draft', async () => {
    mockDraftFindFirst.mockResolvedValue({ id: 'd1', authorId: 'user-1' })
    mockDraftDelete.mockResolvedValue({})

    const req = new NextRequest('http://localhost/api/posts/drafts?draftId=d1', { method: 'DELETE' })
    const res = await DELETE(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.deleted).toBe(true)
  })
})

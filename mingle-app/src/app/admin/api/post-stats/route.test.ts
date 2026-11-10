import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetServerSession, mockGetAdminContext, mockUserFindUnique, mockLoadStats } = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockGetAdminContext: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockLoadStats: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession: mockGetServerSession }))
vi.mock('@/lib/auth-options', () => ({ getAuthOptions: () => ({}) }))
vi.mock('@/server/admin/guard', () => ({ getAdminContext: mockGetAdminContext }))
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: mockUserFindUnique } } }))
vi.mock('@/server/operator-post-stats/load', () => ({ loadOperatorPostStats: mockLoadStats }))

import { GET } from './route'

const STATS = { views: 40, likes: 4, comments: 2, follows: 1, profileVisits: 3, messages: 1 }

function get(ids: string | null) {
  const url = new URL('https://example.com/admin/api/post-stats')
  if (ids !== null) url.searchParams.set('ids', ids)
  return GET(new Request(url))
}

function signedIn(id: string, user: { isOperator?: boolean; isDeleted?: boolean; staff?: boolean }) {
  mockGetServerSession.mockResolvedValue({ user: { id } })
  mockUserFindUnique.mockResolvedValue({
    isOperator: user.isOperator ?? false,
    isDeleted: user.isDeleted ?? false,
    adminNotifyTarget: user.staff ? { userId: id } : null,
  })
}

describe('GET /admin/api/post-stats', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAdminContext.mockResolvedValue(null)
    mockGetServerSession.mockResolvedValue(null)
    mockUserFindUnique.mockResolvedValue(null)
    mockLoadStats.mockResolvedValue(new Map([['op_post', STATS]]))
  })

  it('refuses a normal user before looking at any post', async () => {
    signedIn('user_1', {})
    const response = await get('op_post,user_post')
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'forbidden' })
    expect(mockLoadStats).not.toHaveBeenCalled()
  })

  it('refuses a signed-out reader, even with bad ids', async () => {
    expect((await get(null)).status).toBe(403)
    expect(mockLoadStats).not.toHaveBeenCalled()
  })

  it('refuses a deleted account', async () => {
    signedIn('gone', { staff: true, isDeleted: true })
    expect((await get('op_post')).status).toBe(403)
  })

  it('answers a staff app account for every operator post among the ids', async () => {
    signedIn('staff_1', { staff: true })
    const response = await get('op_post,user_post')
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.json()).toEqual({ stats: { op_post: STATS } })
    expect(mockLoadStats).toHaveBeenCalledWith({ postIds: ['op_post', 'user_post'], authorId: null })
  })

  it('answers an admin session without an app account', async () => {
    mockGetAdminContext.mockResolvedValue({ sessionId: 's1', ip: null, userAgent: null })
    const response = await get('op_post')
    expect(response.status).toBe(200)
    expect(mockUserFindUnique).not.toHaveBeenCalled()
    expect(mockLoadStats).toHaveBeenCalledWith({ postIds: ['op_post'], authorId: null })
  })

  it("limits an operator account to its own posts", async () => {
    signedIn('operator_1', { isOperator: true })
    await get('op_post')
    expect(mockLoadStats).toHaveBeenCalledWith({ postIds: ['op_post'], authorId: 'operator_1' })
  })

  it('needs 1 to 20 well-formed ids', async () => {
    signedIn('staff_1', { staff: true })
    expect((await get('')).status).toBe(400)
    expect((await get("'; drop table")).status).toBe(400)
    expect((await get(Array.from({ length: 21 }, (_, index) => `p${index}`).join(','))).status).toBe(400)
    const deduped = await get('p1,p1, p2 ,')
    expect(deduped.status).toBe(200)
    expect(mockLoadStats).toHaveBeenLastCalledWith({ postIds: ['p1', 'p2'], authorId: null })
  })
})

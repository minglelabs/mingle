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
vi.mock('@/server/admin/user-activity-stats', () => ({ loadUserActivityStats: mockLoadStats }))

import { GET } from './route'

function get(userId: string | null) {
  const url = new URL('https://example.com/admin/api/user-stats')
  if (userId !== null) url.searchParams.set('userId', userId)
  return GET(new Request(url))
}

function signedIn(id: string, user: { isOperator?: boolean; staff?: boolean }) {
  mockGetServerSession.mockResolvedValue({ user: { id } })
  mockUserFindUnique.mockResolvedValue({ isOperator: user.isOperator ?? false, isDeleted: false, adminNotifyTarget: user.staff ? { userId: id } : null })
}

describe('GET /admin/api/user-stats', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAdminContext.mockResolvedValue(null)
    mockGetServerSession.mockResolvedValue(null)
    mockUserFindUnique.mockResolvedValue(null)
    mockLoadStats.mockResolvedValue({ user: { id: 'u_1' }, metrics: [], conversations: { roomsWithOthers: 0, partners: 0, topPartners: [] } })
  })

  it('refuses signed-out people, ordinary users and operator persona accounts without reading anything', async () => {
    expect((await get('u_1')).status).toBe(403)
    signedIn('user_9', {})
    expect((await get('u_1')).status).toBe(403)
    signedIn('op_1', { isOperator: true })
    expect((await get('u_1')).status).toBe(403)
    expect(mockLoadStats).not.toHaveBeenCalled()
  })

  it('answers a staff app account and an admin session', async () => {
    signedIn('royce', { staff: true })
    const response = await get('u_1')
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mockLoadStats).toHaveBeenCalledWith('u_1')
    mockGetServerSession.mockResolvedValue(null)
    mockGetAdminContext.mockResolvedValue({ sessionId: 's', ip: null, userAgent: null })
    expect((await get('u_1')).status).toBe(200)
  })

  it('rejects a bad id and reports an unknown account', async () => {
    signedIn('royce', { staff: true })
    expect((await get('../x')).status).toBe(400)
    expect((await get(null)).status).toBe(400)
    mockLoadStats.mockResolvedValue(null)
    expect((await get('nobody')).status).toBe(404)
  })
})

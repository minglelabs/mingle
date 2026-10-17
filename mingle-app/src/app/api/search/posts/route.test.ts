import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
  mockGetServerSession,
  mockPostFindMany,
  mockUserFindUnique,
  mockPostLikeFindMany,
  mockUserFollowFindMany,
  mockPostTranslationFindMany,
  mockPostCommentFindMany,
  mockQueryRaw,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockPostFindMany: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockPostLikeFindMany: vi.fn(),
  mockUserFollowFindMany: vi.fn(),
  mockPostTranslationFindMany: vi.fn(),
  mockPostCommentFindMany: vi.fn(),
  mockQueryRaw: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession: mockGetServerSession }))
vi.mock('@/lib/auth-options', () => ({ getAuthOptions: () => ({}) }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: mockQueryRaw,
    post: { findMany: mockPostFindMany },
    user: { findUnique: mockUserFindUnique },
    postLike: { findMany: mockPostLikeFindMany },
    userFollow: { findMany: mockUserFollowFindMany },
    postTranslation: { findMany: mockPostTranslationFindMany },
    postComment: { findMany: mockPostCommentFindMany },
  },
}))

import { GET } from './route'

function post(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    authorId: 'a1',
    bodyVersion: 1,
    sourceText: 'hello world',
    sourceLanguage: 'en',
    backgroundKey: 'warm-cream',
    imageObjectKey: null,
    visibility: 'public',
    deletedAt: null,
    likeCount: 0,
    commentCount: 0,
    publishedAt: new Date('2026-01-01T00:00:00.000Z'),
    author: { id: 'a1', handle: 'a', name: 'A', image: null },
    ...overrides,
  }
}

describe('GET /api/search/posts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetServerSession.mockResolvedValue({ user: { id: 'viewer' } })
    mockUserFindUnique.mockResolvedValue({ defaultDisplayLanguage: null })
    mockPostLikeFindMany.mockResolvedValue([])
    mockUserFollowFindMany.mockResolvedValue([])
    mockPostTranslationFindMany.mockResolvedValue([])
    mockPostCommentFindMany.mockResolvedValue([])
  })

  it('returns an empty list for a blank query without querying posts', async () => {
    const res = await GET(new NextRequest('http://localhost/api/search/posts?q=%20%20'))
    const json = await res.json()
    expect(json).toEqual({ posts: [], nextCursor: null })
    expect(mockQueryRaw).not.toHaveBeenCalled()
    expect(mockPostFindMany).not.toHaveBeenCalled()
  })

  it('filters, scores and pages in SQL: one page of ids, never every match', async () => {
    mockQueryRaw.mockResolvedValue([{ id: 'p3' }, { id: 'p1' }, { id: 'p2' }])
    mockPostFindMany.mockResolvedValue([
      post({ id: 'p1', sourceText: 'hello' }),
      post({ id: 'p2', sourceText: 'hello' }),
      post({ id: 'p3', sourceText: 'hello' }),
    ])

    const res = await GET(new NextRequest('http://localhost/api/search/posts?q=hello&limit=5'))
    const json = await res.json()

    // SQL order is kept even though the detail read returned rows in another order.
    expect(json.posts.map((p: { id: string }) => p.id)).toEqual(['p3', 'p1', 'p2'])
    expect(json.nextCursor).toBeNull()
    const sql = mockQueryRaw.mock.calls[0][0] as { sql: string; values: unknown[] }
    const flat = sql.sql.replace(/\s+/g, ' ')
    expect(flat).toContain('p.like_count + 2 * ( SELECT count(DISTINCT c.author_id)')
    expect(flat).toContain('c.author_id <> p.author_id')
    expect(flat).toContain('p.published_at DESC, p.id DESC OFFSET ? LIMIT ?')
    expect(flat).toContain('t.body_version = p.body_version')
    expect(flat).toContain("t.status = 'ready'")
    expect(sql.values).toEqual(expect.arrayContaining(['%hello%', 0, 6]))
    // The detail read is bounded to the page and re-applies visiblePostWhere.
    const where = mockPostFindMany.mock.calls[0][0].where
    expect(where.id).toEqual({ in: ['p3', 'p1', 'p2'] })
    expect(where.visibility).toBe('public')
    expect(where.moderationHiddenAt).toBeNull()
    expect(where.hides).toEqual({ none: { userId: 'viewer' } })
    // No per-request scan of every match's comments/translations.
    expect(mockPostCommentFindMany).not.toHaveBeenCalled()
    expect(mockPostTranslationFindMany).not.toHaveBeenCalled()
  })

  it('pages with a stable offset cursor: next page starts where the last one ended', async () => {
    mockQueryRaw.mockResolvedValueOnce([{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }])
    mockPostFindMany.mockResolvedValueOnce([post({ id: 'p1' }), post({ id: 'p2' })])
    const first = await (await GET(new NextRequest('http://localhost/api/search/posts?q=hello&limit=2'))).json()
    expect(first.posts.map((p: { id: string }) => p.id)).toEqual(['p1', 'p2'])
    expect(typeof first.nextCursor).toBe('string')

    mockQueryRaw.mockResolvedValueOnce([{ id: 'p3' }])
    mockPostFindMany.mockResolvedValueOnce([post({ id: 'p3' })])
    const second = await (await GET(
      new NextRequest(`http://localhost/api/search/posts?q=hello&limit=2&cursor=${first.nextCursor}`),
    )).json()
    expect(second.posts.map((p: { id: string }) => p.id)).toEqual(['p3'])
    expect(second.nextCursor).toBeNull()
    const secondSql = mockQueryRaw.mock.calls[1][0] as { values: unknown[] }
    expect(secondSql.values.slice(-2)).toEqual([2, 3])
  })

  it('drops a page row that fails the authoritative visibility re-check', async () => {
    mockQueryRaw.mockResolvedValue([{ id: 'p1' }, { id: 'gone' }])
    mockPostFindMany.mockResolvedValue([post({ id: 'p1' })])
    const json = await (await GET(new NextRequest('http://localhost/api/search/posts?q=hello'))).json()
    expect(json.posts.map((p: { id: string }) => p.id)).toEqual(['p1'])
  })

  it('omits viewer block/hide clauses for a signed-out viewer', async () => {
    mockGetServerSession.mockResolvedValue(null)
    mockQueryRaw.mockResolvedValue([])
    await GET(new NextRequest('http://localhost/api/search/posts?q=hello'))
    const sql = mockQueryRaw.mock.calls[0][0] as { sql: string }
    expect(sql.sql).not.toContain('app_post_hides')
    expect(sql.sql).not.toContain('app_user_blocks')
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ─── In-memory fake of the Prisma calls the feed service makes ──────────────

type FakePost = {
  id: string
  authorId: string
  publishedAt: Date
  likeCount: number
  hidden?: boolean
}
type FakeView = { userId: string; postId: string; viewedAt: Date }

const db = vi.hoisted(() => ({
  posts: [] as FakePost[],
  views: [] as FakeView[],
  follows: [] as Array<{ followerId: string; followingId: string; createdAt: Date }>,
  comments: [] as Array<{ postId: string; authorId: string; createdAt: Date }>,
  likes: [] as Array<{ postId: string; createdAt: Date }>,
  postFindManyCalls: 0,
}))

type Where = Record<string, unknown> & {
  id?: { in: string[] }
  publishedAt?: { lte: Date }
}

vi.mock('@/server/posts/post-visibility', () => ({
  visiblePostWhere: () => ({ __visible: true }),
}))

vi.mock('@/lib/prisma', () => {
  const pageRow = (p: FakePost) => ({
    id: p.id,
    authorId: p.authorId,
    bodyVersion: 1,
    sourceText: `text ${p.id}`,
    sourceLanguage: 'en',
    backgroundKey: null,
    imageObjectKey: null,
    visibility: 'public',
    deletedAt: null,
    likeCount: p.likeCount,
    commentCount: 0,
    publishedAt: p.publishedAt,
    author: { id: p.authorId, handle: p.authorId, name: null, image: null, imageObjectKey: null },
  })
  return {
    prisma: {
      post: {
        findMany: async ({ where }: { where: Where }) => {
          db.postFindManyCalls += 1
          let rows = db.posts.filter((p) => !p.hidden)
          if (where.publishedAt) rows = rows.filter((p) => p.publishedAt <= where.publishedAt!.lte)
          if (where.id) rows = rows.filter((p) => where.id!.in.includes(p.id))
          // Deliberately unsorted (reverse insertion) to prove the service
          // does not depend on DB order.
          return [...rows].reverse().map(pageRow)
        },
      },
      postView: {
        findMany: async ({ where }: { where: { userId: string; viewedAt: { lt: Date } } }) =>
          db.views
            .filter((v) => v.userId === where.userId && v.viewedAt < where.viewedAt.lt)
            .map((v) => ({ postId: v.postId })),
      },
      userFollow: {
        findMany: async ({ where }: { where: { followerId: string; createdAt: { lt: Date } } }) =>
          db.follows
            .filter((f) => f.followerId === where.followerId && f.createdAt < where.createdAt.lt)
            .map((f) => ({ followingId: f.followingId })),
      },
      postComment: {
        findMany: async ({ where }: { where: { postId: { in: string[] }; createdAt: { lt: Date } } }) =>
          db.comments
            .filter((c) => where.postId.in.includes(c.postId) && c.createdAt < where.createdAt.lt)
            .map((c) => ({ postId: c.postId, authorId: c.authorId })),
      },
      postLike: {
        findMany: async ({ where }: { where: { postId: { in: string[] }; createdAt: { gte: Date } } }) =>
          db.likes
            .filter((l) => where.postId.in.includes(l.postId) && l.createdAt >= where.createdAt.gte)
            .map((l) => ({ postId: l.postId })),
      },
    },
  }
})

import { __resetFeedSnapshotCache, getFeed } from './feed-service'
import { decodeCursor } from './feed-ranking'

const T0 = new Date('2026-09-26T12:00:00.000Z')

function seedPosts(authors: string[]) {
  // p0 is the newest; each later post is one minute older.
  db.posts = authors.map((authorId, i) => ({
    id: `p${i}`,
    authorId,
    publishedAt: new Date(T0.getTime() - (i + 1) * 60_000),
    likeCount: 0,
  }))
}

function markViewed(userId: string, ids: string[]) {
  for (const postId of ids) db.views.push({ userId, postId, viewedAt: new Date() })
}

function advance(ms: number) {
  vi.setSystemTime(new Date(Date.now() + ms))
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
  db.posts = []
  db.views = []
  db.follows = []
  db.comments = []
  db.likes = []
  db.postFindManyCalls = 0
  __resetFeedSnapshotCache()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('getFeed – page stability inside one snapshot', () => {
  const authors = ['a', 'b', 'c', 'd', 'e', 'f']

  it('page 2 continues page 1 after page 1 is viewed (no cache: recompute is stable)', async () => {
    seedPosts(authors)
    const page1 = await getFeed('viewer', null, 2)
    expect(page1.posts.map((p) => p.id)).toEqual(['p0', 'p1'])

    advance(5_000)
    markViewed('viewer', ['p0', 'p1'])
    __resetFeedSnapshotCache()

    const page2 = await getFeed('viewer', page1.nextCursor, 2)
    expect(page2.posts.map((p) => p.id)).toEqual(['p2', 'p3'])
  })

  it('page 2 continues page 1 with the cached snapshot too', async () => {
    seedPosts(authors)
    const page1 = await getFeed('viewer', null, 2)
    advance(5_000)
    markViewed('viewer', ['p0', 'p1'])
    const page2 = await getFeed('viewer', page1.nextCursor, 2)
    expect(page2.posts.map((p) => p.id)).toEqual(['p2', 'p3'])
  })

  it('a post published after the snapshot does not shift the cycle', async () => {
    seedPosts(authors)
    const page1 = await getFeed('viewer', null, 2)
    advance(5_000)
    db.posts.unshift({ id: 'late', authorId: 'z', publishedAt: new Date(), likeCount: 0 })
    __resetFeedSnapshotCache()
    const page2 = await getFeed('viewer', page1.nextCursor, 2)
    expect(page2.posts.map((p) => p.id)).toEqual(['p2', 'p3'])
  })

  it('likes added after the snapshot do not reorder it', async () => {
    seedPosts(authors)
    const page1 = await getFeed('viewer', null, 2)
    advance(5_000)
    // p5 (last) suddenly gets 50 likes during the cycle.
    db.posts[5].likeCount = 50
    for (let i = 0; i < 50; i++) db.likes.push({ postId: 'p5', createdAt: new Date() })
    __resetFeedSnapshotCache()
    const page2 = await getFeed('viewer', page1.nextCursor, 2)
    expect(page2.posts.map((p) => p.id)).toEqual(['p2', 'p3'])
  })

  it('tops a page up when a post became invisible since the snapshot', async () => {
    seedPosts(authors)
    const page1 = await getFeed('viewer', null, 2)
    db.posts[2].hidden = true
    const page2 = await getFeed('viewer', page1.nextCursor, 2)
    expect(page2.posts.map((p) => p.id)).toEqual(['p3', 'p4'])
  })

  it('reads only the page rows on a cache hit', async () => {
    seedPosts(authors)
    const page1 = await getFeed('viewer', null, 2)
    db.postFindManyCalls = 0
    await getFeed('viewer', page1.nextCursor, 2)
    expect(db.postFindManyCalls).toBe(1)
  })
})

describe('getFeed – cycle contract', () => {
  async function readCycle(viewer: string | null, firstCursor: string | null, limit: number) {
    const ids: string[] = []
    const authorsSeen: string[] = []
    let cursor = firstCursor
    for (let guard = 0; guard < 50; guard++) {
      const page = await getFeed(viewer, cursor, limit)
      expect(page.nextCursor).not.toBeNull()
      ids.push(...page.posts.map((p) => p.id))
      authorsSeen.push(...page.posts.map((p) => p.authorId))
      cursor = page.nextCursor
      if (decodeCursor(cursor!)!.restart) return { ids, authorsSeen, next: cursor! }
    }
    throw new Error('cycle never ended')
  }

  it('serves every post exactly once per cycle, then restarts at offset 0 on a new snapshot', async () => {
    seedPosts(['a', 'b', 'c', 'd', 'e'])
    const cycle1 = await readCycle('viewer', null, 2)
    expect(cycle1.ids).toEqual(['p0', 'p1', 'p2', 'p3', 'p4'])
    expect(new Set(cycle1.ids).size).toBe(cycle1.ids.length)

    const restart = decodeCursor(cycle1.next)!
    expect(restart.offset).toBe(0)
    expect(restart.restart).toBe(true)

    // The viewer saw p0..p2 during cycle 1; the new snapshot reflects it.
    advance(1_000)
    markViewed('viewer', ['p0', 'p1', 'p2'])
    advance(1_000)
    const cycle2 = await readCycle('viewer', cycle1.next, 2)
    expect(cycle2.ids).toEqual(['p3', 'p4', 'p0', 'p1', 'p2'])
    expect(new Set(cycle2.ids).size).toBe(5)

    // The pages of cycle 2 carry the new snapshot time, not the old one.
    const cycle2Snapshot = decodeCursor(cycle2.next)!.snapshotAt
    expect(Date.parse(cycle2Snapshot)).toBeGreaterThan(Date.parse(restart.snapshotAt))
  })

  it('keeps nextCursor non-null with a single post and repeats it each cycle', async () => {
    seedPosts(['solo'])
    const first = await getFeed(null, null, 10)
    expect(first.posts.map((p) => p.id)).toEqual(['p0'])
    expect(first.nextCursor).not.toBeNull()
    advance(1_000)
    const second = await getFeed(null, first.nextCursor, 10)
    expect(second.posts.map((p) => p.id)).toEqual(['p0'])
    expect(second.nextCursor).not.toBeNull()
  })

  it('does not open the next cycle with the previous cycle\'s last author when avoidable', async () => {
    // Natural order: p0(alice) p1(bob) p2(alice). Cycle 1 ends on alice.
    seedPosts(['alice', 'bob', 'alice'])
    const cycle1 = await readCycle(null, null, 3)
    expect(cycle1.authorsSeen.at(-1)).toBe('alice')
    advance(1_000)
    const cycle2 = await readCycle(null, cycle1.next, 3)
    expect(cycle2.authorsSeen[0]).toBe('bob')
    expect(new Set(cycle2.ids).size).toBe(3)
  })

  it('returns no posts and a null cursor only when nothing is visible', async () => {
    const res = await getFeed('viewer', null, 10)
    expect(res).toEqual({ posts: [], nextCursor: null })
  })

  it('restarts a stale cursor whose offset is past the end instead of returning nothing', async () => {
    seedPosts(['a', 'b'])
    const page1 = await getFeed('viewer', null, 1)
    db.posts.pop()
    __resetFeedSnapshotCache()
    const page2 = await getFeed('viewer', page1.nextCursor, 1)
    expect(page2.posts.map((p) => p.id)).toEqual(['p0'])
    expect(page2.nextCursor).not.toBeNull()
  })

  it('rejects a malformed cursor', async () => {
    seedPosts(['a'])
    expect(await getFeed('viewer', 'garbage', 10)).toEqual({ posts: [], nextCursor: null })
  })
})

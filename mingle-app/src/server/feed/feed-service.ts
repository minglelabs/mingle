/**
 * Feed service – ranks a per-viewer SNAPSHOT of the feed and pages it.
 *
 * Paging / cycle contract (the feed client in components/feed relies on it):
 *
 * - A cycle is one ranked snapshot, identified by the cursor's `snapshotAt`.
 *   Inside one snapshot the order is fixed, so paging by offset never skips
 *   an unseen post or repeats a post: every id appears at most once per cycle.
 *   The ranking only uses facts that existed at `snapshotAt` — posts with
 *   `publishedAt <= snapshotAt`, PostView rows with `viewedAt < snapshotAt`
 *   (viewedAt is the first-view time and is never bumped, see post-view.ts),
 *   comments created before it, and likes minus those added after it — and
 *   ties are broken by publishedAt DESC, id DESC. Viewing page 1 therefore
 *   does not reorder page 2.
 * - When the last page of a cycle is served, `nextCursor` is a restart cursor:
 *   using it opens a NEW snapshot at that moment (views made during the
 *   previous cycle now count) and serves it from offset 0. Ids repeat from
 *   there on; the client treats the first repeated id as the start of a new
 *   cycle. The new cycle avoids opening with the author of the previous
 *   cycle's last card when an alternative exists in the same group.
 * - While at least one post is visible, `nextCursor` is never null.
 *
 * ⚠️ In-memory snapshot cache: ranked id lists are kept per
 * (viewer, snapshotAt, boundary author) in THIS process for a short TTL, so a
 * page request normally reads only its own rows instead of the whole corpus.
 * This assumes one server instance (railway.json `numReplicas: 1`). With more
 * instances a miss simply recomputes the ranking from the snapshot-bounded
 * data above; that is deterministic except for likes REMOVED during the
 * snapshot and hide/block changes, which can shift the order by a place.
 */

import { prisma } from '@/lib/prisma'
import { visiblePostWhere } from '@/server/posts/post-visibility'
import {
  type FeedCandidate,
  type FeedCursor,
  decodeCursor,
  encodeCursor,
  rankFeed,
} from './feed-ranking'

const DEFAULT_LIMIT = 10
const MAX_LIMIT = 50

/** How long a ranked snapshot stays cached in memory. */
export const FEED_SNAPSHOT_TTL_MS = 10 * 60_000
/** Upper bound on cached snapshots (oldest evicted first). */
const FEED_SNAPSHOT_CACHE_MAX = 500

export interface FeedResultPost {
  id: string
  authorId: string
  bodyVersion: number
  sourceText: string | null
  sourceLanguage: string | null
  backgroundKey: string | null
  imageObjectKey: string | null
  imageWidth: number | null
  imageHeight: number | null
  visibility: string
  deletedAt: Date | null
  likeCount: number
  commentCount: number
  publishedAt: Date
  viewed: boolean
  author: {
    id: string
    handle: string
    name: string | null
    image: string | null
    imageObjectKey: string | null
  }
}

export interface FeedResult {
  posts: FeedResultPost[]
  nextCursor: string | null
}

// ---------------------------------------------------------------------------
// Ranked snapshot (+ in-memory cache)
// ---------------------------------------------------------------------------

type RankedSnapshot = {
  ids: string[]
  authorById: Map<string, string>
  /** Posts that counted as seen when the snapshot was ranked. */
  viewed: Set<string>
}

type CacheEntry = { snapshot: RankedSnapshot; expiresAt: number }

const snapshotCache = new Map<string, CacheEntry>()

function cacheKey(viewerId: string | null, snapshotAt: Date, avoidFirstAuthorId: string | null): string {
  return [viewerId ?? '', snapshotAt.toISOString(), avoidFirstAuthorId ?? ''].join('\u0000')
}

/** Test-only: drop every cached snapshot. */
export function __resetFeedSnapshotCache(): void {
  snapshotCache.clear()
}

async function rankSnapshot(
  viewerId: string | null,
  snapshotAt: Date,
  avoidFirstAuthorId: string | null,
): Promise<RankedSnapshot> {
  const posts = await prisma.post.findMany({
    where: {
      ...visiblePostWhere(viewerId),
      publishedAt: { lte: snapshotAt },
    },
    select: { id: true, authorId: true, publishedAt: true, likeCount: true },
    orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
  })

  if (posts.length === 0) {
    return { ids: [], authorById: new Map(), viewed: new Set() }
  }
  const postIds = posts.map((p) => p.id)

  // Seen before the snapshot only; views during this cycle count next cycle.
  const viewedRows = viewerId
    ? await prisma.postView.findMany({
        where: { userId: viewerId, viewedAt: { lt: snapshotAt } },
        select: { postId: true },
      })
    : []
  const viewed = new Set(viewedRows.map((r) => r.postId))

  const followRows = viewerId
    ? await prisma.userFollow.findMany({
        where: { followerId: viewerId, createdAt: { lt: snapshotAt } },
        select: { followingId: true },
      })
    : []
  const followedAuthorIds = new Set(followRows.map((r) => r.followingId))

  // Unique commenters per post, excluding the post author, as of the snapshot.
  const comments = await prisma.postComment.findMany({
    where: {
      postId: { in: postIds },
      createdAt: { lt: snapshotAt },
      OR: [{ isDeleted: null }, { isDeleted: false }],
    },
    select: { postId: true, authorId: true },
  })

  // likeCount is live; subtract likes added after the snapshot.
  const lateLikes = await prisma.postLike.findMany({
    where: { postId: { in: postIds }, createdAt: { gte: snapshotAt } },
    select: { postId: true },
  })
  const lateLikeCount = new Map<string, number>()
  for (const l of lateLikes) lateLikeCount.set(l.postId, (lateLikeCount.get(l.postId) ?? 0) + 1)

  const authorById = new Map(posts.map((p) => [p.id, p.authorId]))
  const commenterMap = new Map<string, Set<string>>()
  for (const c of comments) {
    if (c.authorId === authorById.get(c.postId)) continue
    let set = commenterMap.get(c.postId)
    if (!set) {
      set = new Set()
      commenterMap.set(c.postId, set)
    }
    set.add(c.authorId)
  }

  const candidates: FeedCandidate[] = posts.map((p) => ({
    id: p.id,
    authorId: p.authorId,
    publishedAt: p.publishedAt,
    likeCount: Math.max(0, p.likeCount - (lateLikeCount.get(p.id) ?? 0)),
    uniqueCommenterIds: commenterMap.get(p.id) ?? new Set(),
    viewed: viewed.has(p.id),
  }))

  const ids = rankFeed(candidates, followedAuthorIds, snapshotAt, { avoidFirstAuthorId })
  return { ids, authorById, viewed }
}

async function loadRankedSnapshot(
  viewerId: string | null,
  snapshotAt: Date,
  avoidFirstAuthorId: string | null,
): Promise<RankedSnapshot> {
  const key = cacheKey(viewerId, snapshotAt, avoidFirstAuthorId)
  const nowMs = Date.now()
  const hit = snapshotCache.get(key)
  if (hit && hit.expiresAt > nowMs) return hit.snapshot

  const snapshot = await rankSnapshot(viewerId, snapshotAt, avoidFirstAuthorId)

  snapshotCache.delete(key)
  snapshotCache.set(key, { snapshot, expiresAt: nowMs + FEED_SNAPSHOT_TTL_MS })
  for (const [k, entry] of snapshotCache) {
    if (snapshotCache.size <= FEED_SNAPSHOT_CACHE_MAX && entry.expiresAt > nowMs) break
    snapshotCache.delete(k)
  }
  return snapshot
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const PAGE_SELECT = {
  id: true,
  authorId: true,
  bodyVersion: true,
  sourceText: true,
  sourceLanguage: true,
  backgroundKey: true,
  imageObjectKey: true,
  imageWidth: true,
  imageHeight: true,
  visibility: true,
  deletedAt: true,
  likeCount: true,
  commentCount: true,
  publishedAt: true,
  author: {
    select: {
      id: true,
      handle: true,
      name: true,
      image: true,
      imageObjectKey: true,
      isOfficial: true,
    },
  },
} as const

export async function getFeed(
  viewerId: string | null,
  rawCursor: string | null,
  rawLimit: number | null,
): Promise<FeedResult> {
  const limit = Math.max(1, Math.min(rawLimit ?? DEFAULT_LIMIT, MAX_LIMIT))

  let snapshotAt: Date
  let offset: number
  let avoidFirstAuthorId: string | null
  if (rawCursor) {
    const cursor: FeedCursor | null = decodeCursor(rawCursor)
    if (!cursor) return { posts: [], nextCursor: null }
    avoidFirstAuthorId = cursor.avoidFirstAuthorId ?? null
    if (cursor.restart) {
      snapshotAt = new Date()
      offset = 0
    } else {
      snapshotAt = new Date(cursor.snapshotAt)
      offset = cursor.offset
    }
  } else {
    snapshotAt = new Date()
    offset = 0
    avoidFirstAuthorId = null
  }

  let snapshot = await loadRankedSnapshot(viewerId, snapshotAt, avoidFirstAuthorId)
  if (snapshot.ids.length === 0) return { posts: [], nextCursor: null }

  if (offset >= snapshot.ids.length) {
    // A stale cursor past the end (the snapshot shrank): start a new cycle.
    avoidFirstAuthorId = snapshot.authorById.get(snapshot.ids[snapshot.ids.length - 1]) ?? null
    snapshotAt = new Date()
    offset = 0
    snapshot = await loadRankedSnapshot(viewerId, snapshotAt, avoidFirstAuthorId)
    if (snapshot.ids.length === 0) return { posts: [], nextCursor: null }
  }

  // Read only this page's rows. Posts that became invisible since the
  // snapshot (deleted, hidden, blocked) are dropped and the page is topped up
  // from the following ids, so a page is short only at the end of a cycle.
  const total = snapshot.ids.length
  const rows: Array<Awaited<ReturnType<typeof loadPageRows>>[number]> = []
  let pos = offset
  while (rows.length < limit && pos < total) {
    const chunk = snapshot.ids.slice(pos, pos + (limit - rows.length))
    pos += chunk.length
    rows.push(...(await loadPageRows(viewerId, chunk)))
  }

  const posts: FeedResultPost[] = rows.map((p) => ({ ...p, viewed: snapshot.viewed.has(p.id) }))

  const nextCursor =
    pos < total
      ? encodeCursor({
          snapshotAt: snapshotAt.toISOString(),
          offset: pos,
          viewedPhase: false,
          ...(avoidFirstAuthorId ? { avoidFirstAuthorId } : {}),
        })
      : encodeCursor({
          snapshotAt: snapshotAt.toISOString(),
          offset: 0,
          viewedPhase: false,
          restart: true,
          avoidFirstAuthorId:
            rows.at(-1)?.authorId ?? snapshot.authorById.get(snapshot.ids[total - 1]) ?? null,
        })

  return { posts, nextCursor }
}

async function loadPageRows(viewerId: string | null, ids: string[]) {
  if (ids.length === 0) return []
  const found = await prisma.post.findMany({
    where: { ...visiblePostWhere(viewerId), id: { in: ids } },
    select: PAGE_SELECT,
  })
  const byId = new Map(found.map((p) => [p.id, p]))
  return ids.flatMap((id) => {
    const p = byId.get(id)
    return p ? [p] : []
  })
}

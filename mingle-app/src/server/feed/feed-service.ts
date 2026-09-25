/**
 * Feed service – fetches candidates from DB and applies ranking.
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

export interface FeedResult {
  posts: Array<{
    id: string
    authorId: string
    sourceText: string | null
    sourceLanguage: string | null
    backgroundKey: string | null
    imageObjectKey: string | null
    likeCount: number
    commentCount: number
    publishedAt: string
    viewed: boolean
    author: {
      id: string
      handle: string
      name: string | null
      image: string | null
      imageObjectKey: string | null
    }
  }>
  nextCursor: string | null
}

export async function getFeed(
  viewerId: string,
  rawCursor: string | null,
  rawLimit: number | null,
): Promise<FeedResult> {
  const now = new Date()
  const limit = Math.max(1, Math.min(rawLimit ?? DEFAULT_LIMIT, MAX_LIMIT))

  // Decode or create initial cursor
  let cursor: FeedCursor
  if (rawCursor) {
    const decoded = decodeCursor(rawCursor)
    if (!decoded) {
      return { posts: [], nextCursor: null }
    }
    cursor = decoded
  } else {
    cursor = {
      snapshotAt: now.toISOString(),
      offset: 0,
      viewedPhase: false,
    }
  }

  const snapshotAt = new Date(cursor.snapshotAt)

  // Fetch all visible posts published at or before the snapshot time.
  // Application-level sort: we load all candidates and rank in JS because
  // the composite ranking rules (time-tier bucketing, follow priority,
  // same-author avoidance, unseen-before-seen with recycling) cannot be
  // expressed in a single SQL ORDER BY.
  //
  // For a social feed with typically < 10 000 active posts this is fine.
  // If the corpus grows to 100k+ a windowed approach with SQL pre-filtering
  // on time tiers would be the next step.
  const allPosts = await prisma.post.findMany({
    where: {
      ...visiblePostWhere(viewerId),
      publishedAt: { lte: snapshotAt },
    },
    select: {
      id: true,
      authorId: true,
      sourceText: true,
      sourceLanguage: true,
      backgroundKey: true,
      imageObjectKey: true,
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
        },
      },
    },
  })

  if (allPosts.length === 0) {
    return { posts: [], nextCursor: null }
  }

  // Gather viewer's viewed post IDs
  const viewedRows = await prisma.postView.findMany({
    where: { userId: viewerId },
    select: { postId: true },
  })
  const viewedPostIds = new Set(viewedRows.map((r) => r.postId))

  // Gather viewer's followed author IDs
  const followRows = await prisma.userFollow.findMany({
    where: { followerId: viewerId },
    select: { followingId: true },
  })
  const followedAuthorIds = new Set(followRows.map((r) => r.followingId))

  // Gather unique commenter IDs per post (excluding post author, counting
  // each commenter once even with multiple comments)
  const postIds = allPosts.map((p) => p.id)
  const comments = await prisma.postComment.findMany({
    where: {
      postId: { in: postIds },
      OR: [{ isDeleted: null }, { isDeleted: false }],
    },
    select: {
      postId: true,
      authorId: true,
    },
  })

  // Build a map: postId -> Set<commenterId> (excluding post author)
  const postAuthorMap = new Map(allPosts.map((p) => [p.id, p.authorId]))
  const commenterMap = new Map<string, Set<string>>()
  for (const c of comments) {
    const postAuthor = postAuthorMap.get(c.postId)
    if (c.authorId === postAuthor) continue // exclude post author's own comments
    let set = commenterMap.get(c.postId)
    if (!set) {
      set = new Set()
      commenterMap.set(c.postId, set)
    }
    set.add(c.authorId)
  }

  // Build candidates
  const candidates: FeedCandidate[] = allPosts.map((p) => ({
    id: p.id,
    authorId: p.authorId,
    publishedAt: p.publishedAt,
    likeCount: p.likeCount,
    uniqueCommenterIds: commenterMap.get(p.id) ?? new Set(),
    viewed: viewedPostIds.has(p.id),
  }))

  // Rank
  const rankedIds = rankFeed(candidates, followedAuthorIds, snapshotAt)

  // --- Paging with recycle ---
  // The ranked list: first unseen, then seen. If we exhaust both, we recycle
  // from the beginning (wrapping offset).
  const totalCount = rankedIds.length
  let offset = cursor.offset

  // If offset >= totalCount, we've gone through everything once.
  // Recycle: reset to 0 (spec says "no end notice, just recycle").
  if (offset >= totalCount) {
    offset = 0
  }

  const pageIds = rankedIds.slice(offset, offset + limit)

  if (pageIds.length === 0) {
    // No posts at all (should not happen because we checked allPosts.length above,
    // but guard anyway)
    return { posts: [], nextCursor: null }
  }

  // Build a lookup map for quick access
  const postMap = new Map(allPosts.map((p) => [p.id, p]))

  const posts = pageIds.map((id) => {
    const p = postMap.get(id)!
    return {
      id: p.id,
      authorId: p.authorId,
      sourceText: p.sourceText,
      sourceLanguage: p.sourceLanguage,
      backgroundKey: p.backgroundKey,
      imageObjectKey: p.imageObjectKey,
      likeCount: p.likeCount,
      commentCount: p.commentCount,
      publishedAt: p.publishedAt.toISOString(),
      viewed: viewedPostIds.has(p.id),
      author: p.author,
    }
  })

  // Compute next cursor
  const nextOffset = offset + limit
  const hasMore = nextOffset < totalCount || totalCount > 0 // always allow recycle
  const nextCursor = hasMore
    ? encodeCursor({
        snapshotAt: cursor.snapshotAt,
        offset: nextOffset >= totalCount ? 0 : nextOffset,
        viewedPhase: cursor.viewedPhase,
      })
    : null

  return { posts, nextCursor }
}

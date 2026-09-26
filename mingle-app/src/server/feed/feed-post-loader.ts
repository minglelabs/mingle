/**
 * Batched loader for the post serializer.
 *
 * Given a page of post rows already fetched by an endpoint (feed ranking,
 * profile grid, search, archive/trash, hidden list), this gathers everything
 * the pure `serializeFeedPosts` converter needs — the viewer's likes and
 * follows over exactly this page, the current-body-version translations for the
 * resolved display language, and the display language itself — in a fixed
 * number of queries regardless of page size (no N+1).
 */

import { prisma } from '@/lib/prisma'
import {
  resolveDisplayLanguage,
  serializeFeedPosts,
  type SerializerContext,
  type SerializerPostRow,
  type SerializerTranslationRow,
} from '@/server/posts/feed-post-serializer'
import type { FeedPostDto } from '@/lib/feed-post-dto'

/**
 * Prisma `select` producing exactly a `SerializerPostRow`. Every list endpoint
 * uses this so the loaded shape and the serializer input never drift.
 */
export const feedPostRowSelect = {
  id: true,
  authorId: true,
  bodyVersion: true,
  sourceText: true,
  sourceLanguage: true,
  backgroundKey: true,
  imageObjectKey: true,
  visibility: true,
  deletedAt: true,
  likeCount: true,
  commentCount: true,
  publishedAt: true,
  author: { select: { id: true, handle: true, name: true, image: true } },
} as const

export type LoadContextOptions = {
  viewerId: string | null
  rawDisplayLanguage: string | null
  /** Surface `deletedAt` (trash list only). */
  includeDeletedAt?: boolean
}

/**
 * Build a `SerializerContext` for a page of posts with batched queries.
 * `posts` carries the same rows that will be serialized, in any order.
 */
export async function loadSerializerContext(
  posts: readonly SerializerPostRow[],
  options: LoadContextOptions,
): Promise<SerializerContext> {
  const { viewerId, rawDisplayLanguage, includeDeletedAt } = options

  const postIds = posts.map((p) => p.id)
  const authorIds = Array.from(new Set(posts.map((p) => p.authorId)))

  // Resolve display language (needs the viewer's default — one small read).
  let viewerDefaultDisplayLanguage: string | null = null
  if (viewerId) {
    const viewer = await prisma.user.findUnique({
      where: { id: viewerId },
      select: { defaultDisplayLanguage: true },
    })
    viewerDefaultDisplayLanguage = viewer?.defaultDisplayLanguage ?? null
  }
  const displayLanguage = resolveDisplayLanguage(rawDisplayLanguage, viewerDefaultDisplayLanguage)

  // Batched viewer-relative reads (only when signed in and there are posts).
  let likedPostIds: ReadonlySet<string> = new Set()
  let followedAuthorIds: ReadonlySet<string> = new Set()
  if (viewerId && postIds.length > 0) {
    const [likes, follows] = await Promise.all([
      prisma.postLike.findMany({
        where: { userId: viewerId, postId: { in: postIds } },
        select: { postId: true },
      }),
      authorIds.length > 0
        ? prisma.userFollow.findMany({
            where: { followerId: viewerId, followingId: { in: authorIds } },
            select: { followingId: true },
          })
        : Promise.resolve([]),
    ])
    likedPostIds = new Set(likes.map((l) => l.postId))
    followedAuthorIds = new Set(follows.map((f) => f.followingId))
  }

  // Translations for the resolved language + each post's CURRENT body version.
  const translationByPostId = new Map<string, SerializerTranslationRow>()
  if (displayLanguage && postIds.length > 0) {
    const currentVersionByPost = new Map(posts.map((p) => [p.id, p.bodyVersion]))
    const rows = await prisma.postTranslation.findMany({
      where: { postId: { in: postIds }, language: displayLanguage },
      select: { postId: true, bodyVersion: true, language: true, status: true, text: true },
    })
    for (const row of rows) {
      // Only the current body version counts; earlier versions are stale.
      if (currentVersionByPost.get(row.postId) !== row.bodyVersion) continue
      translationByPostId.set(row.postId, row)
    }
  }

  return {
    viewerId,
    displayLanguage,
    likedPostIds,
    followedAuthorIds,
    translationByPostId,
    includeDeletedAt: includeDeletedAt ?? false,
  }
}

/** Convenience: load the context for a page and serialize it in one call. */
export async function serializePostsPage(
  posts: readonly SerializerPostRow[],
  options: LoadContextOptions,
): Promise<FeedPostDto[]> {
  const ctx = await loadSerializerContext(posts, options)
  return serializeFeedPosts(posts, ctx)
}

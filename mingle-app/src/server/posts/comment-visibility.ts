/**
 * Comment visibility helpers.
 *
 * Centralises the Prisma `where` conditions that decide which comments a
 * viewer can see. Every comment endpoint imports this.
 */

import type { Prisma } from '@prisma/client'

import { notMutuallyBlockedWhere, visibleAuthorWhere } from './block-visibility'

/**
 * Re-exported so comment endpoints have one import for visibility concerns.
 * The rules themselves live in block-visibility.ts, shared with post visibility.
 */
export { notMutuallyBlockedWhere, visibleAuthorWhere }

/**
 * Base condition for visible comments on a post.
 * Excludes: operator-hidden comments, operator-hidden or blocked authors.
 * `viewerId` is null for a signed-out viewer (no blocks apply).
 *
 * NOTE: Soft-deleted comments with replies are returned with isDeleted=true
 * and sourceText redacted by the API layer. The DB query includes them so the
 * reply tree structure is preserved.
 */
export function visibleCommentsWhere(postId: string, viewerId: string | null): Prisma.PostCommentWhereInput {
  return {
    postId,
    moderationHiddenAt: null,
    author: visibleAuthorWhere(viewerId),
  }
}

/**
 * Condition for a single comment the viewer can access.
 */
export function visibleSingleCommentWhere(commentId: string, viewerId: string | null): Prisma.PostCommentWhereInput {
  return {
    id: commentId,
    moderationHiddenAt: null,
    author: visibleAuthorWhere(viewerId),
  }
}

/**
 * Condition for own comment (for edit/delete by author).
 */
export function ownCommentWhere(commentId: string, authorId: string): Prisma.PostCommentWhereInput {
  return {
    id: commentId,
    authorId,
    OR: [{ isDeleted: null }, { isDeleted: false }],
  }
}

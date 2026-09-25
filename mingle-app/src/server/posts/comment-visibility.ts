/**
 * Comment visibility helpers.
 *
 * Centralises the Prisma `where` conditions that decide which comments a
 * viewer can see. Every comment endpoint imports this.
 */

import type { Prisma } from '@prisma/client'

import { notMutuallyBlockedWhere } from './block-visibility'

/**
 * Re-exported so comment endpoints have one import for visibility concerns.
 * The rule itself lives in block-visibility.ts, shared with post visibility.
 */
export { notMutuallyBlockedWhere }

/**
 * Base condition for visible comments on a post.
 * Excludes: soft-deleted (unless they have live replies), blocked authors.
 *
 * NOTE: Soft-deleted comments with replies are returned with isDeleted=true
 * and sourceText redacted by the API layer. The DB query includes them so the
 * reply tree structure is preserved.
 */
export function visibleCommentsWhere(postId: string, viewerId: string): Prisma.PostCommentWhereInput {
  return {
    postId,
    author: notMutuallyBlockedWhere(viewerId),
  }
}

/**
 * Condition for a single comment the viewer can access.
 */
export function visibleSingleCommentWhere(commentId: string, viewerId: string): Prisma.PostCommentWhereInput {
  return {
    id: commentId,
    author: notMutuallyBlockedWhere(viewerId),
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

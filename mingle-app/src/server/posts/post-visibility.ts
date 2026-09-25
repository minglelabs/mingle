/**
 * Post visibility filters.
 *
 * Centralises the Prisma `where` condition that decides which posts a viewer
 * can see. Every feed / list / detail endpoint imports this instead of
 * duplicating the logic.
 */

import type { Prisma } from '@prisma/client'

/**
 * Returns a Prisma `where` clause that excludes posts the viewer must not see:
 *
 * 1. visibility !== 'public'
 * 2. isDeleted (soft-deleted / trashed)
 * 3. moderationHiddenAt is set (admin hidden)
 * 4. Mutual block (viewer blocks author OR author blocks viewer)
 * 5. Viewer explicitly hid the post (PostHide)
 */
export function visiblePostWhere(viewerId: string): Prisma.PostWhereInput {
  return {
    visibility: 'public',
    OR: [{ isDeleted: null }, { isDeleted: false }],
    moderationHiddenAt: null,
    // Exclude posts from mutually blocked users (either direction)
    author: {
      AND: [
        { blockedByRelations: { none: { blockerId: viewerId } } },
        { blockingRelations: { none: { blockedId: viewerId } } },
      ],
    },
    // Exclude posts the viewer explicitly hid
    hides: { none: { userId: viewerId } },
  }
}

/**
 * Returns a Prisma `where` clause for accessing a single post by id.
 * Same visibility rules as `visiblePostWhere` but scoped to one postId.
 */
export function visibleSinglePostWhere(postId: string, viewerId: string): Prisma.PostWhereInput {
  return {
    id: postId,
    ...visiblePostWhere(viewerId),
  }
}

/**
 * Returns a minimal `where` clause that checks only ownership + not-deleted.
 * Used for mutation endpoints where the actor must be the author.
 */
export function ownPostWhere(postId: string, authorId: string): Prisma.PostWhereInput {
  return {
    id: postId,
    authorId,
    OR: [{ isDeleted: null }, { isDeleted: false }],
  }
}

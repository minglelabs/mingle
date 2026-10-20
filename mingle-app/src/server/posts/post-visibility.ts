/**
 * Post visibility filters.
 *
 * Centralises the Prisma `where` condition that decides which posts a viewer
 * can see. Every feed / list / detail endpoint imports this instead of
 * duplicating the logic.
 */

import type { Prisma } from '@prisma/client'

import { visibleAuthorWhere } from './block-visibility'

/**
 * Returns a Prisma `where` clause that excludes posts the viewer must not see:
 *
 * 1. visibility !== 'public'
 * 2. isDeleted (soft-deleted / trashed)
 * 3. moderationHiddenAt is set (admin hidden)
 * 4. Author hidden by an operator, or mutual block (viewer blocks author OR
 *    author blocks viewer) — see visibleAuthorWhere
 * 5. Viewer explicitly hid the post (PostHide)
 *
 * `viewerId` is null for a signed-out viewer of the public feed: no blocks and
 * no hides apply, every other rule does.
 */
export function visiblePostWhere(viewerId: string | null): Prisma.PostWhereInput {
  return {
    visibility: 'public',
    OR: [{ isDeleted: null }, { isDeleted: false }],
    moderationHiddenAt: null,
    author: visibleAuthorWhere(viewerId),
    // Exclude posts the viewer explicitly hid
    ...(viewerId ? { hides: { none: { userId: viewerId } } } : {}),
  }
}

/**
 * Returns a Prisma `where` clause for accessing a single post by id.
 * Same visibility rules as `visiblePostWhere` but scoped to one postId.
 */
export function visibleSinglePostWhere(postId: string, viewerId: string | null): Prisma.PostWhereInput {
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

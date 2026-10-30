/**
 * The mutual-block rule, in one place.
 *
 * A block is stored one-directionally (UserBlock: blocker -> blocked) but
 * applies both ways when deciding what content is visible: if either party
 * blocked the other, neither sees the other's posts or comments.
 *
 * Post and comment visibility both need this, and re-deriving it in each
 * module is how the two drift apart, so both import it from here.
 */

import type { Prisma } from '@prisma/client'

/**
 * Condition on the CONTENT AUTHOR that holds only when no block exists in
 * either direction between that author and the viewer. Compose it into a
 * post/comment `where` via the `author` relation.
 */
export function notMutuallyBlockedWhere(viewerId: string | null): Prisma.UserWhereInput {
  // An anonymous viewer has no blocks in either direction.
  if (!viewerId) return {}
  return {
    AND: [
      // The viewer blocked the author.
      { blockedByRelations: { none: { blockerId: viewerId } } },
      // The author blocked the viewer.
      { blockingRelations: { none: { blockedId: viewerId } } },
    ],
  }
}

/**
 * Condition on the CONTENT AUTHOR for anything shown to someone else: the
 * author is not hidden by an operator and no block exists between the two.
 * Posts, comments, profile grids and search all compose this one rule.
 */
export function visibleAuthorWhere(viewerId: string | null): Prisma.UserWhereInput {
  return {
    moderationHiddenAt: null,
    ...notMutuallyBlockedWhere(viewerId),
  }
}

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
export function notMutuallyBlockedWhere(viewerId: string): Prisma.UserWhereInput {
  return {
    AND: [
      // The viewer blocked the author.
      { blockedByRelations: { none: { blockerId: viewerId } } },
      // The author blocked the viewer.
      { blockingRelations: { none: { blockedId: viewerId } } },
    ],
  }
}

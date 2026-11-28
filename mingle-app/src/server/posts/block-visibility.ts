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
 * "This account is shown in the app", in one place. An account is hidden for
 * one of these reasons, each with its own mark, set and cleared on its own:
 *
 * - `moderationHiddenAt`: hidden by staff, either from a report
 *   (src/server/reports/moderation-service.ts) or by 내리고 검토로 on an
 *   operator account (src/server/operators/account-takedown.ts, which keeps
 *   its own list of the accounts it hid).
 * - `dormantAt`: a dormant account (src/server/dormancy.ts). Waking it clears
 *   only this mark, so an account staff hid stays hidden.
 *
 * Raw SQL that lists accounts repeats the same two columns
 * (`moderation_hidden_at IS NULL AND dormant_at IS NULL`): post search,
 * people search and the explore tab.
 */
export function accountShownInAppWhere(): { moderationHiddenAt: null; dormantAt: null } {
  return { moderationHiddenAt: null, dormantAt: null }
}

/**
 * Condition on the CONTENT AUTHOR for anything shown to someone else: the
 * author's account is shown in the app (not hidden by staff, not dormant)
 * and no block exists between the two. Posts, comments, profile grids and
 * search all compose this one rule.
 */
export function visibleAuthorWhere(viewerId: string | null): Prisma.UserWhereInput {
  return {
    ...accountShownInAppWhere(),
    ...notMutuallyBlockedWhere(viewerId),
  }
}

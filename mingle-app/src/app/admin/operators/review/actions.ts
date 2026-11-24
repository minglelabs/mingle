'use server'

import { requireAdmin } from '@/server/admin/guard'
import { listReviewQueue, type ReviewItem } from '@/server/operator-review/review'

/** The next page of the review queue (one kind, or one account's items), for the board to append. */
export async function loadMoreReview(args: { cursor: string; kind?: ReviewItem['kind'] | null; userId?: string | null }) {
  await requireAdmin('/admin/operators/review')
  const queue = await listReviewQueue({ cursor: args.cursor, kind: args.kind ?? undefined, userId: args.userId ?? undefined })
  return { items: queue.items, nextCursor: queue.nextCursor }
}

/**
 * "Seen post" record (PostView) — the single write path.
 *
 * `viewedAt` is the FIRST time the viewer saw the post and is never bumped on
 * later views. The home feed ranks a snapshot with `viewedAt < snapshotAt`
 * (see feed-service.ts); if a re-view moved `viewedAt` past the snapshot, a
 * post that ranked as "seen" on page 1 would rank as "unseen" on page 2 and
 * the offset paging would duplicate or skip posts.
 *
 * Callers: the view beacon (1s continuous dwell), and a post like / a new
 * comment, which count as having seen the post immediately (checklist 73).
 */

import { prisma } from '@/lib/prisma'

export async function markPostViewed(userId: string, postId: string): Promise<void> {
  await prisma.postView.upsert({
    where: { postId_userId: { postId, userId } },
    create: { postId, userId, viewedAt: new Date() },
    // Keep the first-view time: see the module comment.
    update: {},
  })
}

/**
 * Best-effort variant for side paths (like / comment): a failed PostView
 * write must never fail the user's like or comment.
 */
export async function markPostViewedQuietly(userId: string, postId: string): Promise<void> {
  try {
    await markPostViewed(userId, postId)
  } catch (err) {
    console.warn('[feed] markPostViewed failed', err instanceof Error ? err.message : err)
  }
}

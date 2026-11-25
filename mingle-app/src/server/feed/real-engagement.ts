import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

/**
 * What real people did with each post (staff 2026-11-24: after the starter
 * posts, the feed follows real traffic instead of our own ranking): follows
 * and profile visits made from the post, likes, and people who commented.
 * Operator accounts, the official account, staff app accounts and the author
 * are never counted, so the operator engagement plan does not lift a post.
 * Only what happened before `before` counts, so one snapshot always ranks the
 * same way.
 */
export type RealEngagement = { follows: number; profileVisits: number; likes: number; commenters: number }

/** How much each kind of action weighs in the order. */
export const REAL_ENGAGEMENT_WEIGHTS = { follows: 4, profileVisits: 2, commenters: 2, likes: 1 } as const

export function realEngagementScore(engagement: RealEngagement | undefined): number {
  if (!engagement) return 0
  const w = REAL_ENGAGEMENT_WEIGHTS
  return engagement.follows * w.follows + engagement.profileVisits * w.profileVisits + engagement.commenters * w.commenters + engagement.likes * w.likes
}

function realPerson(column: string): Prisma.Sql {
  const ref = Prisma.raw(column)
  return Prisma.sql`NOT EXISTS (
      SELECT 1 FROM "app"."app_users" AS excluded
      WHERE excluded."id" = ${ref} AND (excluded."is_operator" OR excluded."is_official")
    )
    AND NOT EXISTS (SELECT 1 FROM "app"."app_admin_notify_targets" AS staff WHERE staff."user_id" = ${ref})`
}

type Row = { postId: string; kind: 'follows' | 'profileVisits' | 'likes' | 'commenters'; count: number }

export async function loadRealEngagement(postIds: readonly string[], before: Date): Promise<Map<string, RealEngagement>> {
  const result = new Map<string, RealEngagement>()
  if (postIds.length === 0) return result
  const ids = [...postIds]
  const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
    WITH target AS (
      SELECT p."id", p."author_id" FROM "app"."app_posts" AS p WHERE p."id" = ANY(${ids}::text[])
    )
    SELECT f."source_post_id" AS "postId", 'follows' AS kind, COUNT(DISTINCT f."follower_id")::int AS count
      FROM "app"."app_user_follows" AS f JOIN target AS t ON t."id" = f."source_post_id"
      WHERE f."created_at" < ${before} AND f."follower_id" <> t."author_id" AND ${realPerson('f."follower_id"')}
      GROUP BY f."source_post_id"
    UNION ALL
    SELECT v."source_post_id", 'profileVisits', COUNT(DISTINCT v."viewer_id")::int
      FROM "app"."app_profile_views" AS v JOIN target AS t ON t."id" = v."source_post_id"
      WHERE v."created_at" < ${before} AND v."viewer_id" <> t."author_id" AND ${realPerson('v."viewer_id"')}
      GROUP BY v."source_post_id"
    UNION ALL
    SELECT l."post_id", 'likes', COUNT(*)::int
      FROM "app"."app_post_likes" AS l JOIN target AS t ON t."id" = l."post_id"
      WHERE l."created_at" < ${before} AND l."user_id" <> t."author_id" AND ${realPerson('l."user_id"')}
      GROUP BY l."post_id"
    UNION ALL
    SELECT c."post_id", 'commenters', COUNT(DISTINCT c."author_id")::int
      FROM "app"."app_post_comments" AS c JOIN target AS t ON t."id" = c."post_id"
      WHERE c."created_at" < ${before} AND (c."is_deleted" IS NULL OR c."is_deleted" = false)
        AND c."author_id" <> t."author_id" AND ${realPerson('c."author_id"')}
      GROUP BY c."post_id"
  `)
  for (const row of rows) {
    const entry = result.get(row.postId) ?? { follows: 0, profileVisits: 0, likes: 0, commenters: 0 }
    entry[row.kind] = Number(row.count)
    result.set(row.postId, entry)
  }
  return result
}

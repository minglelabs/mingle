import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { sumOperatorPostStats, type OperatorPostStats } from '@/lib/operator-post-stats'
import { ATTRIBUTION_WINDOW_MS, countConversions, type ConversionCandidateRow } from './attribution'

/**
 * Operator post stats (`OperatorPostStats`), read live from the tables. Only
 * posts by operator accounts are ever counted; any other post id is left out
 * of the result, so callers can pass a mixed list.
 */

/** Which posts: a list of ids (optionally of one operator only), or everything published in a range. */
export type OperatorPostStatsTarget =
  | { postIds: readonly string[]; authorId?: string | null }
  | { publishedFrom: Date; publishedTo: Date }

/**
 * SQL condition: the person in `column` is counted. Operator accounts, the
 * official account and staff app accounts (admin notify targets) are not;
 * each query also leaves out the post's author.
 */
function countedPerson(column: string): Prisma.Sql {
  const ref = Prisma.raw(column)
  return Prisma.sql`NOT EXISTS (
      SELECT 1 FROM "app"."app_users" AS excluded
      WHERE excluded."id" = ${ref} AND (excluded."is_operator" OR excluded."is_official")
    )
    AND NOT EXISTS (SELECT 1 FROM "app"."app_admin_notify_targets" AS staff WHERE staff."user_id" = ${ref})`
}

/** `target`: the live operator posts asked for (id, author, publish time). */
function targetPostsCte(target: OperatorPostStatsTarget): Prisma.Sql {
  const filter = 'postIds' in target
    ? Prisma.sql`p."id" = ANY(${[...target.postIds]}::text[])${
      target.authorId ? Prisma.sql` AND p."author_id" = ${target.authorId}` : Prisma.empty
    }`
    : Prisma.sql`p."published_at" >= ${target.publishedFrom} AND p."published_at" < ${target.publishedTo}`
  return Prisma.sql`target AS (
    SELECT p."id", p."author_id", p."published_at"
    FROM "app"."app_posts" AS p
    JOIN "app"."app_users" AS author ON author."id" = p."author_id" AND author."is_operator"
    WHERE ${filter} AND (p."is_deleted" IS NULL OR p."is_deleted" = false)
  )`
}

type CountRow = {
  postId: string
  authorId: string
  publishedAt: Date
  views: number
  likes: number
  comments: number
  profileVisits: number
}

function queryCounts(target: OperatorPostStatsTarget): Promise<CountRow[]> {
  return prisma.$queryRaw<CountRow[]>(Prisma.sql`
    WITH ${targetPostsCte(target)}
    SELECT
      t."id" AS "postId",
      t."author_id" AS "authorId",
      t."published_at" AS "publishedAt",
      (SELECT COUNT(*) FROM "app"."app_post_views" AS v
        WHERE v."post_id" = t."id" AND v."user_id" <> t."author_id" AND ${countedPerson('v."user_id"')})::int AS "views",
      (SELECT COUNT(*) FROM "app"."app_post_likes" AS l
        WHERE l."post_id" = t."id" AND l."user_id" <> t."author_id" AND ${countedPerson('l."user_id"')})::int AS "likes",
      (SELECT COUNT(DISTINCT c."author_id") FROM "app"."app_post_comments" AS c
        WHERE c."post_id" = t."id" AND (c."is_deleted" IS NULL OR c."is_deleted" = false)
          AND c."author_id" <> t."author_id" AND ${countedPerson('c."author_id"')})::int AS "comments",
      (SELECT COUNT(DISTINCT pv."viewer_id") FROM "app"."app_profile_views" AS pv
        WHERE pv."source_post_id" = t."id" AND pv."viewer_id" <> t."author_id" AND ${countedPerson('pv."viewer_id"')})::int AS "profileVisits"
    FROM target AS t
  `)
}

/**
 * Every follow and first message to the authors of the target posts that can
 * still be credited to one of them (made after the earliest of them was
 * published), each with every touch of that author's posts (any post, not
 * only the targets) in the attribution window before it. One row per (event,
 * touch); an event without a touch comes back once with null touch columns.
 * `countConversions` applies the rule (see attribution.ts).
 */
function queryConversionCandidates(target: OperatorPostStatsTarget): Promise<ConversionCandidateRow[]> {
  const windowMs = ATTRIBUTION_WINDOW_MS
  return prisma.$queryRaw<ConversionCandidateRow[]>(Prisma.sql`
    WITH ${targetPostsCte(target)},
    authors AS (SELECT DISTINCT "author_id" FROM target),
    bounds AS (SELECT MIN("published_at") AS "since" FROM target),
    follow_events AS (
      SELECT 'follow'::text AS kind, f."follower_id" AS viewer_id, f."following_id" AS author_id,
        f."created_at" AS at, f."source_post_id" AS source_post_id
      FROM "app"."app_user_follows" AS f
      WHERE f."following_id" IN (SELECT "author_id" FROM authors)
        AND f."created_at" >= (SELECT "since" FROM bounds)
        AND ${countedPerson('f."follower_id"')}
    ),
    message_events AS (
      -- The first message a person sent in any room while the author was a member.
      SELECT 'message'::text AS kind, m."user_id" AS viewer_id, member."user_id" AS author_id,
        MIN(m."created_at") AS at, NULL::text AS source_post_id
      FROM "app"."app_conversation_channel_members" AS member
      JOIN "app"."app_conversation_channels" AS channel ON channel."id" = member."channel_id"
      JOIN "app"."app_messages" AS m ON m."session_key" = channel."session_key"
      WHERE member."user_id" IN (SELECT "author_id" FROM authors)
        AND m."user_id" IS NOT NULL
        AND m."user_id" <> member."user_id"
        AND m."created_at" >= member."joined_at"
        AND (member."left_at" IS NULL OR m."created_at" < member."left_at")
        AND ${countedPerson('m."user_id"')}
      GROUP BY m."user_id", member."user_id"
      HAVING MIN(m."created_at") >= (SELECT "since" FROM bounds)
    ),
    events AS (
      SELECT * FROM follow_events
      UNION ALL
      SELECT * FROM message_events
    )
    SELECT
      e.kind AS "kind",
      e.viewer_id AS "viewerId",
      e.author_id AS "authorId",
      e.at AS "at",
      e.source_post_id AS "sourcePostId",
      touch.post_id AS "touchPostId",
      touch.at AS "touchAt"
    FROM events AS e
    LEFT JOIN LATERAL (
      SELECT v."post_id" AS post_id, v."viewed_at" AS at
      FROM "app"."app_post_views" AS v
      JOIN "app"."app_posts" AS p ON p."id" = v."post_id" AND p."author_id" = e.author_id
      WHERE v."user_id" = e.viewer_id
        AND v."viewed_at" <= e.at
        AND v."viewed_at" >= e.at - (${windowMs}::double precision * INTERVAL '1 millisecond')
      UNION ALL
      SELECT pv."source_post_id" AS post_id, pv."created_at" AS at
      FROM "app"."app_profile_views" AS pv
      WHERE pv."viewer_id" = e.viewer_id
        AND pv."profile_user_id" = e.author_id
        AND pv."source_post_id" IS NOT NULL
        AND pv."created_at" <= e.at
        AND pv."created_at" >= e.at - (${windowMs}::double precision * INTERVAL '1 millisecond')
    ) AS touch ON true
  `)
}

export type OperatorPostStatsRecord = {
  postId: string
  authorId: string
  publishedAt: Date
  stats: OperatorPostStats
}

/** The stats that come from the counts query alone; follows and messages also need the attribution query. */
export const OPERATOR_POST_COUNT_STAT_KEYS = ['views', 'likes', 'comments', 'profileVisits'] as const
export type OperatorPostCountStatKey = (typeof OPERATOR_POST_COUNT_STAT_KEYS)[number]

function countStatsOf(row: CountRow): Pick<OperatorPostStats, OperatorPostCountStatKey> {
  return {
    views: Number(row.views) || 0,
    likes: Number(row.likes) || 0,
    comments: Number(row.comments) || 0,
    profileVisits: Number(row.profileVisits) || 0,
  }
}

function combineOperatorPostStats(counts: readonly CountRow[], candidates: readonly ConversionCandidateRow[]): OperatorPostStatsRecord[] {
  const conversions = countConversions(candidates, counts.map((row) => row.postId))
  return counts.map((row) => {
    const counted = countStatsOf(row)
    const credited = conversions.get(row.postId)
    return {
      postId: row.postId,
      authorId: row.authorId,
      publishedAt: row.publishedAt,
      stats: {
        views: counted.views,
        likes: counted.likes,
        comments: counted.comments,
        follows: credited?.follows ?? 0,
        profileVisits: counted.profileVisits,
        messages: credited?.messages ?? 0,
      },
    }
  })
}

async function queryOperatorPostStats(target: OperatorPostStatsTarget): Promise<OperatorPostStatsRecord[]> {
  if ('postIds' in target && target.postIds.length === 0) return []
  const [counts, candidates] = await Promise.all([queryCounts(target), queryConversionCandidates(target)])
  return combineOperatorPostStats(counts, candidates)
}

/** Stats by post id, for the operator posts among `target` (other ids are absent). */
export async function loadOperatorPostStats(target: OperatorPostStatsTarget): Promise<Map<string, OperatorPostStats>> {
  const records = await queryOperatorPostStats(target)
  return new Map(records.map((record) => [record.postId, record.stats]))
}

// ─── Admin dashboard ─────────────────────────────────────────────────────────

export const OPERATOR_POST_DASHBOARD_ROW_LIMIT = 100
const SNIPPET_LENGTH = 120

export type OperatorPostStatsListRow = {
  postId: string
  authorId: string
  authorName: string | null
  authorHandle: string
  /** The opening of the post text, on one line. */
  snippet: string
  photoCount: number
  /** ISO 8601. */
  publishedAt: string
  stats: OperatorPostStats
}

export type OperatorPostStatsDashboard = {
  /** Operator posts published in the range. */
  postCount: number
  /** Sums over all of them. */
  totals: OperatorPostStats
  /** The most viewed of them (at most OPERATOR_POST_DASHBOARD_ROW_LIMIT), most viewed first. */
  rows: OperatorPostStatsListRow[]
}

/** Most viewed first; equal views, the newer post first. */
export function compareByViews(left: OperatorPostStatsRecord, right: OperatorPostStatsRecord): number {
  return right.stats.views - left.stats.views
    || right.publishedAt.getTime() - left.publishedAt.getTime()
    || (left.postId < right.postId ? -1 : left.postId > right.postId ? 1 : 0)
}

function toSnippet(text: string | null): string {
  const flat = (text ?? '').replace(/\s+/g, ' ').trim()
  return flat.length > SNIPPET_LENGTH ? `${flat.slice(0, SNIPPET_LENGTH)}…` : flat
}

/** The range's post count, and the stats `K` summed over its posts. */
export type OperatorPostStatsTotals<K extends keyof OperatorPostStats = keyof OperatorPostStats> = {
  postCount: number
  totals: Pick<OperatorPostStats, K>
}

/**
 * The dashboard's operator-post stats in the order they can be shown: the counts query and
 * the attribution query run side by side, and each promise settles as soon as what it
 * needs is in. Each already has a no-op rejection handler, so one a caller leaves unused
 * never surfaces as an unhandled rejection; a caller that awaits it still sees the error.
 */
export type OperatorPostStatsDashboardLoad = {
  /** The post count, views, likes, comments and profile visits: the counts query alone. */
  countTotals: Promise<OperatorPostStatsTotals<OperatorPostCountStatKey>>
  /** Every stat summed, follows and messages included: both queries. */
  totals: Promise<OperatorPostStatsTotals>
  /** Totals and the most viewed posts with their details, for the table. */
  dashboard: Promise<OperatorPostStatsDashboard>
}

export function startOperatorPostStatsDashboardLoad(
  range: { rangeStart: Date; rangeEnd: Date },
  limit: number = OPERATOR_POST_DASHBOARD_ROW_LIMIT,
): OperatorPostStatsDashboardLoad {
  const target = { publishedFrom: range.rangeStart, publishedTo: range.rangeEnd }
  const counts = queryCounts(target)
  const records = Promise.all([counts, queryConversionCandidates(target)])
    .then(([countRows, candidates]) => combineOperatorPostStats(countRows, candidates))
  const load: OperatorPostStatsDashboardLoad = {
    countTotals: counts.then((rows) => {
      const totals = { views: 0, likes: 0, comments: 0, profileVisits: 0 }
      for (const row of rows) {
        const counted = countStatsOf(row)
        for (const key of OPERATOR_POST_COUNT_STAT_KEYS) totals[key] += counted[key]
      }
      return { postCount: rows.length, totals }
    }),
    totals: records.then((recs) => ({ postCount: recs.length, totals: sumOperatorPostStats(recs.map((record) => record.stats)) })),
    dashboard: records.then((recs) => buildOperatorPostStatsDashboard(recs, limit)),
  }
  for (const promise of [load.countTotals, load.totals, load.dashboard]) promise.catch(() => undefined)
  return load
}

/** Operator posts published in the dashboard range: totals, and the most viewed with their stats. */
export async function loadOperatorPostStatsDashboard(
  range: { rangeStart: Date; rangeEnd: Date },
  limit: number = OPERATOR_POST_DASHBOARD_ROW_LIMIT,
): Promise<OperatorPostStatsDashboard> {
  const records = await queryOperatorPostStats({ publishedFrom: range.rangeStart, publishedTo: range.rangeEnd })
  return buildOperatorPostStatsDashboard(records, limit)
}

async function buildOperatorPostStatsDashboard(
  records: readonly OperatorPostStatsRecord[],
  limit: number,
): Promise<OperatorPostStatsDashboard> {
  const top = [...records].sort(compareByViews).slice(0, Math.max(0, limit))
  const posts = top.length
    ? await prisma.post.findMany({
        where: { id: { in: top.map((record) => record.postId) } },
        select: {
          id: true,
          sourceText: true,
          imageObjectKey: true,
          _count: { select: { extraImages: true } },
          author: { select: { name: true, handle: true } },
        },
      })
    : []
  const postsById = new Map(posts.map((post) => [post.id, post]))
  const rows: OperatorPostStatsListRow[] = []
  for (const record of top) {
    const post = postsById.get(record.postId)
    if (!post) continue
    rows.push({
      postId: record.postId,
      authorId: record.authorId,
      authorName: post.author.name,
      authorHandle: post.author.handle,
      snippet: toSnippet(post.sourceText),
      photoCount: post.imageObjectKey ? 1 + post._count.extraImages : 0,
      publishedAt: record.publishedAt.toISOString(),
      stats: record.stats,
    })
  }
  return {
    postCount: records.length,
    totals: sumOperatorPostStats(records.map((record) => record.stats)),
    rows,
  }
}

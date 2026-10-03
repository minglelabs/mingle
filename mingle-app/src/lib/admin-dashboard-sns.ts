import { prisma } from "@/lib/prisma";
import type { AdminDashboardDateRange, DailyPoint, DashboardMetric } from "@/lib/admin-dashboard-metrics";

/**
 * SNS (posting feed) metrics for the admin dashboard, queried live per page
 * load: one small grouped query per metric, all in parallel.
 *
 * Like the rest of the dashboard, days are UTC and operator accounts are left
 * out as ACTORS: a like, comment, follow or view counts only when a real user
 * did it. Reactions real users give to operator posts are therefore included
 * (and also shown on their own, to see what the operator accounts bring in).
 * Unlike the cached metrics there is no platform split: these tables do not
 * record the client platform.
 */
export type SnsMetricKey =
  | "posts"
  | "posters"
  | "postViews"
  | "postLikes"
  | "comments"
  | "commentLikes"
  | "follows"
  | "engagedUsers"
  | "operatorPosts"
  | "operatorPostReactions"
  | "reports";

export type SnsSummary = {
  /** Sums over the range, by metric. */
  totals: Record<SnsMetricKey, number>;
  /** Likes per 100 first views of a post, or null without views. */
  likesPer100Views: number | null;
  /** Comments per post written in the range, or null without posts. */
  commentsPerPost: number | null;
  /** Share of real users' reactions (likes + comments) that went to operator posts, 0..1, or null. */
  operatorReactionShare: number | null;
};

export type SnsDashboard = { metrics: DashboardMetric[]; summary: SnsSummary };

type RawDayValue = { day: string; value: bigint | number };

const REAL_USER = (column: string) =>
  `not exists (select 1 from "app"."app_users" as op where op."id" = ${column} and op."is_operator")`;
const OPERATOR_USER = (column: string) =>
  `exists (select 1 from "app"."app_users" as op where op."id" = ${column} and op."is_operator")`;
const LIVE = (alias: string) => `(${alias}."is_deleted" is null or ${alias}."is_deleted" = false)`;
const DAY = (column: string) => `to_char(date_trunc('day', ${column}), 'YYYY-MM-DD')`;

/** Runs a `select day, value ... group by day` query bound to the range. */
async function queryDaily(sql: string, range: AdminDashboardDateRange): Promise<Map<string, number>> {
  const rows = await prisma.$queryRawUnsafe<RawDayValue[]>(sql, range.rangeStart, range.rangeEnd);
  return new Map(rows.map((row) => [row.day, Number(row.value)]));
}

const QUERIES: Record<SnsMetricKey, string> = {
  posts: `select ${DAY('p."published_at"')} as day, count(*) as value
    from "app"."app_posts" as p
    where p."published_at" >= $1 and p."published_at" < $2 and ${LIVE("p")} and ${REAL_USER('p."author_id"')}
    group by day`,
  posters: `select ${DAY('p."published_at"')} as day, count(distinct p."author_id") as value
    from "app"."app_posts" as p
    where p."published_at" >= $1 and p."published_at" < $2 and ${LIVE("p")} and ${REAL_USER('p."author_id"')}
    group by day`,
  postViews: `select ${DAY('v."viewed_at"')} as day, count(*) as value
    from "app"."app_post_views" as v
    where v."viewed_at" >= $1 and v."viewed_at" < $2 and ${REAL_USER('v."user_id"')}
    group by day`,
  postLikes: `select ${DAY('l."created_at"')} as day, count(*) as value
    from "app"."app_post_likes" as l
    where l."created_at" >= $1 and l."created_at" < $2 and ${REAL_USER('l."user_id"')}
    group by day`,
  comments: `select ${DAY('c."created_at"')} as day, count(*) as value
    from "app"."app_post_comments" as c
    where c."created_at" >= $1 and c."created_at" < $2 and ${LIVE("c")} and ${REAL_USER('c."author_id"')}
    group by day`,
  commentLikes: `select ${DAY('l."created_at"')} as day, count(*) as value
    from "app"."app_post_comment_likes" as l
    where l."created_at" >= $1 and l."created_at" < $2 and ${REAL_USER('l."user_id"')}
    group by day`,
  follows: `select ${DAY('f."created_at"')} as day, count(*) as value
    from "app"."app_user_follows" as f
    where f."created_at" >= $1 and f."created_at" < $2 and ${REAL_USER('f."follower_id"')}
    group by day`,
  engagedUsers: `select day, count(distinct user_id) as value from (
      select ${DAY('p."published_at"')} as day, p."author_id" as user_id from "app"."app_posts" as p
        where p."published_at" >= $1 and p."published_at" < $2 and ${LIVE("p")}
      union all
      select ${DAY('l."created_at"')}, l."user_id" from "app"."app_post_likes" as l
        where l."created_at" >= $1 and l."created_at" < $2
      union all
      select ${DAY('c."created_at"')}, c."author_id" from "app"."app_post_comments" as c
        where c."created_at" >= $1 and c."created_at" < $2 and ${LIVE("c")}
      union all
      select ${DAY('cl."created_at"')}, cl."user_id" from "app"."app_post_comment_likes" as cl
        where cl."created_at" >= $1 and cl."created_at" < $2
      union all
      select ${DAY('f."created_at"')}, f."follower_id" from "app"."app_user_follows" as f
        where f."created_at" >= $1 and f."created_at" < $2
    ) as actions
    where ${REAL_USER("actions.user_id")}
    group by day`,
  operatorPosts: `select ${DAY('p."published_at"')} as day, count(*) as value
    from "app"."app_posts" as p
    where p."published_at" >= $1 and p."published_at" < $2 and ${LIVE("p")} and ${OPERATOR_USER('p."author_id"')}
    group by day`,
  operatorPostReactions: `select day, count(*) as value from (
      select ${DAY('l."created_at"')} as day
        from "app"."app_post_likes" as l join "app"."app_posts" as p on p."id" = l."post_id"
        where l."created_at" >= $1 and l."created_at" < $2
          and ${REAL_USER('l."user_id"')} and ${OPERATOR_USER('p."author_id"')}
      union all
      select ${DAY('c."created_at"')}
        from "app"."app_post_comments" as c join "app"."app_posts" as p on p."id" = c."post_id"
        where c."created_at" >= $1 and c."created_at" < $2 and ${LIVE("c")}
          and ${REAL_USER('c."author_id"')} and ${OPERATOR_USER('p."author_id"')}
    ) as reactions
    group by day`,
  reports: `select ${DAY('r."created_at"')} as day, count(*) as value
    from "app"."app_user_reports" as r
    where r."created_at" >= $1 and r."created_at" < $2 and r."target_type" in ('post', 'comment')
    group by day`,
};

/** Display order and Korean labels. */
export const SNS_METRIC_LABELS: ReadonlyArray<{ key: SnsMetricKey; label: string; unit: string }> = [
  { key: "engagedUsers", label: "SNS 참여 사용자 (글·좋아요·댓글·팔로우)", unit: "명" },
  { key: "posts", label: "새 글", unit: "개" },
  { key: "posters", label: "글 쓴 사용자", unit: "명" },
  { key: "postViews", label: "글 조회 (사용자별 첫 조회)", unit: "회" },
  { key: "postLikes", label: "글 좋아요", unit: "개" },
  { key: "comments", label: "댓글·답글", unit: "개" },
  { key: "commentLikes", label: "댓글 좋아요", unit: "개" },
  { key: "follows", label: "팔로우", unit: "건" },
  { key: "operatorPostReactions", label: "운영 계정 글이 받은 반응 (실사용자의 좋아요+댓글)", unit: "개" },
  { key: "operatorPosts", label: "운영 계정 글", unit: "개" },
  { key: "reports", label: "글·댓글 신고", unit: "건" },
];

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

/** Fills every day of the range (a day without rows is 0) and sums the range. */
export function buildSnsDashboard(dayKeys: readonly string[], byMetric: Record<SnsMetricKey, Map<string, number>>): SnsDashboard {
  const totals = {} as Record<SnsMetricKey, number>;
  const metrics: DashboardMetric[] = SNS_METRIC_LABELS.map(({ key, label, unit }) => {
    const points: DailyPoint[] = dayKeys.map((day) => ({ day, value: byMetric[key].get(day) ?? 0 }));
    totals[key] = points.reduce((sum, point) => sum + (point.value ?? 0), 0);
    return { key: `sns_${key}`, label, unit, kind: "count", points };
  });
  return {
    metrics,
    summary: {
      totals,
      likesPer100Views: ratio(totals.postLikes * 100, totals.postViews),
      commentsPerPost: ratio(totals.comments, totals.posts + totals.operatorPosts),
      operatorReactionShare: ratio(totals.operatorPostReactions, totals.postLikes + totals.comments),
    },
  };
}

export async function loadSnsDashboard(range: AdminDashboardDateRange): Promise<SnsDashboard> {
  const keys = Object.keys(QUERIES) as SnsMetricKey[];
  const results = await Promise.all(keys.map((key) => queryDaily(QUERIES[key], range)));
  const byMetric = Object.fromEntries(keys.map((key, index) => [key, results[index]])) as Record<SnsMetricKey, Map<string, number>>;
  return buildSnsDashboard(range.dayKeys, byMetric);
}

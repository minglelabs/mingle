import { prisma } from "@/lib/prisma";
import { type AdminDashboardDateRange, type DailyPoint, shiftDayKey } from "@/lib/admin-dashboard-metrics";

/**
 * Signups and retention for the admin dashboard, queried live per page load.
 *
 * A signup is a real account, as querySignups counts it (password or linked
 * auth account, never an operator). A user is "active" on a UTC day when they
 * did anything that leaves a row: sent a message, opened a post, liked, wrote a
 * post or comment, or followed someone. Retention is classic day-N: active on
 * exactly the Nth UTC day after the signup day. A user only counts toward Dn
 * once that day has fully passed. No platform split, like the SNS block.
 */
export const RETENTION_DAYS = [1, 7, 30] as const;
export type RetentionDay = typeof RETENTION_DAYS[number];

/** Weekly signup cohorts shown in the table, newest first. */
export const RETENTION_COHORT_WEEKS = 12;

export type RetentionRate = { retained: number; eligible: number };

export type RetentionCohort = {
  /** Monday (UTC) the cohort week starts on. */
  weekStart: string;
  signups: number;
  rates: Record<RetentionDay, RetentionRate>;
};

export type SignupRetentionDashboard = {
  /** Every real account up to now. */
  totalSignups: number;
  /** Accounts made inside the range. */
  rangeSignups: number;
  /** Running total of all accounts, at the end of each day of the range. */
  cumulativePoints: DailyPoint[];
  /** Across every signup so far. */
  overall: Record<RetentionDay, RetentionRate>;
  cohorts: RetentionCohort[];
};

/** One real account: its signup day and which of RETENTION_DAYS it was active on. */
export type SignupActivityRow = { day: string; offsets: number[] };

/** [table, user column, time column] for each kind of activity. */
const ACTIVITY_SOURCES: ReadonlyArray<[string, string, string]> = [
  ['"app"."app_messages"', "user_id", "created_at"],
  ['"app"."app_post_views"', "user_id", "viewed_at"],
  ['"app"."app_post_likes"', "user_id", "created_at"],
  ['"app"."app_post_comment_likes"', "user_id", "created_at"],
  ['"app"."app_post_comments"', "author_id", "created_at"],
  ['"app"."app_posts"', "author_id", "published_at"],
  ['"app"."app_user_follows"', "follower_id", "created_at"],
];

/**
 * One existence probe per user, day N and table, each a short range scan on a
 * (user, time) index. Joining every activity row instead took ~50s in
 * production (hundreds of thousands of messages); this takes under a second.
 * Deleted rows still count: the user was there that day.
 */
const ACTIVE_ON_DAY_N = ACTIVITY_SOURCES.map(([table, user, at]) =>
  `exists (select 1 from ${table} as x where x."${user}" = s."id"
           and x."${at}" >= s.d0 + n * interval '1 day' and x."${at}" < s.d0 + (n + 1) * interval '1 day')`,
).join("\n         or ");

const SIGNUP_ACTIVITY_SQL = `with signup as materialized (
       select u."id", date_trunc('day', u."created_at") as d0
       from "app"."app_users" as u
       where u."is_operator" = false
         and (
           u."password_hash" is not null
           or exists (select 1 from "app"."auth_accounts" as a where a."user_id" = u."id")
         )
     )
     select to_char(s.d0, 'YYYY-MM-DD') as day,
       array(
         select n from unnest(array[${RETENTION_DAYS.join(", ")}]) as n
         where ${ACTIVE_ON_DAY_N}
       ) as offsets
     from signup as s`;

function emptyRates(): Record<RetentionDay, RetentionRate> {
  return Object.fromEntries(RETENTION_DAYS.map((n) => [n, { retained: 0, eligible: 0 }])) as Record<RetentionDay, RetentionRate>;
}

/** The Monday on or before a day key. */
export function weekStartKey(dayKey: string): string {
  const weekday = new Date(`${dayKey}T00:00:00Z`).getUTCDay();
  return shiftDayKey(dayKey, -((weekday + 6) % 7));
}

function countInto(rates: Record<RetentionDay, RetentionRate>, row: SignupActivityRow, todayKey: string) {
  for (const n of RETENTION_DAYS) {
    if (shiftDayKey(row.day, n) >= todayKey) continue; // day N has not fully passed
    rates[n].eligible += 1;
    if (row.offsets.includes(n)) rates[n].retained += 1;
  }
}

export function buildSignupRetention(
  rows: readonly SignupActivityRow[],
  dayKeys: readonly string[],
  todayKey: string,
): SignupRetentionDashboard {
  const perDay = new Map<string, number>();
  for (const row of rows) perDay.set(row.day, (perDay.get(row.day) ?? 0) + 1);

  const firstDay = dayKeys[0] ?? todayKey;
  let running = rows.filter((row) => row.day < firstDay).length;
  const cumulativePoints = dayKeys.map((day) => {
    running += perDay.get(day) ?? 0;
    return { day, value: running };
  });

  const overall = emptyRates();
  const cohortsByWeek = new Map<string, RetentionCohort>();
  const oldestWeek = shiftDayKey(weekStartKey(todayKey), -7 * (RETENTION_COHORT_WEEKS - 1));
  for (const row of rows) {
    countInto(overall, row, todayKey);
    const week = weekStartKey(row.day);
    if (week < oldestWeek) continue;
    const cohort = cohortsByWeek.get(week) ?? { weekStart: week, signups: 0, rates: emptyRates() };
    cohort.signups += 1;
    countInto(cohort.rates, row, todayKey);
    cohortsByWeek.set(week, cohort);
  }

  return {
    totalSignups: rows.length,
    rangeSignups: dayKeys.reduce((sum, day) => sum + (perDay.get(day) ?? 0), 0),
    cumulativePoints,
    overall,
    cohorts: [...cohortsByWeek.values()].sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1)),
  };
}

export async function loadSignupRetention(range: AdminDashboardDateRange, todayKey: string): Promise<SignupRetentionDashboard> {
  const rows = await prisma.$queryRawUnsafe<Array<{ day: string; offsets: number[] }>>(SIGNUP_ACTIVITY_SQL);
  return buildSignupRetention(
    rows.map((row) => ({ day: row.day, offsets: row.offsets.map(Number) })),
    range.dayKeys,
    todayKey,
  );
}

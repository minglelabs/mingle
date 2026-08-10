import { adminDashboardPrisma as prisma } from "@/lib/admin-dashboard-prisma";
import {
  type AdminDashboardDateRange,
  type DailyRow,
  type DashboardMetric,
  fillDailySeries,
} from "@/lib/admin-dashboard-metrics";

/**
 * created_at is stored as naive TIMESTAMP(3) holding a UTC instant, so
 * truncating it directly buckets by UTC day -- the same basis the column
 * is already stored in, no timezone conversion needed.
 */
const DAY_BUCKET_EXPR = (column: string) => `date_trunc('day', "${column}")`;

type RawDayCount = { day: Date; value: bigint | number };
type RawDayLatency = { day: Date; avg_ms: number | null; p95_ms: number | null };

function toDailyRows(rows: readonly RawDayCount[]): DailyRow[] {
  return rows.map((row) => ({ day: dayKeyFromRaw(row.day), value: Number(row.value) }));
}

function splitLatencyRows(rows: readonly RawDayLatency[]): { avg: DailyRow[]; p95: DailyRow[] } {
  const avg: DailyRow[] = [];
  const p95: DailyRow[] = [];
  for (const row of rows) {
    const day = dayKeyFromRaw(row.day);
    avg.push({ day, value: row.avg_ms === null ? null : Number(row.avg_ms) });
    p95.push({ day, value: row.p95_ms === null ? null : Number(row.p95_ms) });
  }
  return { avg, p95 };
}

/**
 * pg parses a naive `timestamp` by reading its wall-clock fields straight into a
 * JS Date's UTC fields, so a date_trunc('day', ...) result of UTC midnight comes
 * back as a Date whose UTC getters already read that same day.
 */
function dayKeyFromRaw(value: Date): string {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * upsertTrackedUser (src/lib/app-analytics.ts) creates an app_users row keyed only by
 * externalUserId for anyone who fires a tracked client event, before they ever sign up
 * -- counting every row here would report anonymous demo visitors as 가입자/signups.
 * A real account always has either a password (email/password signup) or a linked
 * auth_accounts row (Google/Apple OAuth, including the native bridge flow, which both
 * go through the same NextAuth PrismaAdapter user-creation path); anonymous tracking
 * rows have neither.
 */
async function querySignups(range: AdminDashboardDateRange): Promise<DailyRow[]> {
  const rows = await prisma.$queryRawUnsafe<RawDayCount[]>(
    `select ${DAY_BUCKET_EXPR("created_at")} as day, count(*) as value
     from "app"."app_users" as u
     where u."created_at" >= $1 and u."created_at" < $2
       and (
         u."password_hash" is not null
         or exists (select 1 from "app"."auth_accounts" as a where a."user_id" = u."id")
       )
     group by day
     order by day`,
    range.rangeStart,
    range.rangeEnd,
  );
  return toDailyRows(rows);
}

/**
 * DAU = distinct users who sent >=1 message that day. Previously counted the
 * 'stt_session_started' event log, but that event is gated behind a shared
 * "session already active" ref that the native-STT bridge path (use-realtime-stt.ts)
 * flips true before ever calling logClientEvent -- so on production it fires almost
 * never (1 row total vs. hundreds of thousands of stt_turn_started rows), making DAU
 * read as ~0. app_messages is unaffected by that client bug and is the same table
 * queryMessageCount already trusts, so it's the reliable ground truth for "was active".
 */
async function queryDau(range: AdminDashboardDateRange): Promise<DailyRow[]> {
  const rows = await prisma.$queryRawUnsafe<RawDayCount[]>(
    `select ${DAY_BUCKET_EXPR("created_at")} as day, count(distinct "user_id") as value
     from "app"."app_messages"
     where "is_deleted" is distinct from true
       and "user_id" is not null
       and "created_at" >= $1 and "created_at" < $2
     group by day
     order by day`,
    range.rangeStart,
    range.rangeEnd,
  );
  return toDailyRows(rows);
}

async function queryMessageCount(range: AdminDashboardDateRange): Promise<DailyRow[]> {
  const rows = await prisma.$queryRawUnsafe<RawDayCount[]>(
    `select ${DAY_BUCKET_EXPR("created_at")} as day, count(*) as value
     from "app"."app_messages"
     where "is_deleted" is distinct from true
       and "created_at" >= $1 and "created_at" < $2
     group by day
     order by day`,
    range.rangeStart,
    range.rangeEnd,
  );
  return toDailyRows(rows);
}

async function queryUsageSeconds(range: AdminDashboardDateRange): Promise<DailyRow[]> {
  const rows = await prisma.$queryRawUnsafe<RawDayCount[]>(
    `select ${DAY_BUCKET_EXPR("created_at")} as day, coalesce(sum("stt_duration_ms"), 0) / 1000.0 as value
     from "app"."app_messages"
     where "is_deleted" is distinct from true
       and "stt_duration_ms" is not null
       and "created_at" >= $1 and "created_at" < $2
     group by day
     order by day`,
    range.rangeStart,
    range.rangeEnd,
  );
  return toDailyRows(rows);
}

/** STT-only latency: every finalized message has this regardless of whether translation ran. */
async function querySttLatency(range: AdminDashboardDateRange): Promise<{ avg: DailyRow[]; p95: DailyRow[] }> {
  const rows = await prisma.$queryRawUnsafe<RawDayLatency[]>(
    `select
       ${DAY_BUCKET_EXPR("created_at")} as day,
       avg("stt_duration_ms") as avg_ms,
       percentile_cont(0.95) within group (order by "stt_duration_ms") as p95_ms
     from "app"."app_messages"
     where "is_deleted" is distinct from true
       and "stt_duration_ms" is not null
       and "created_at" >= $1 and "created_at" < $2
     group by day
     order by day`,
    range.rangeStart,
    range.rangeEnd,
  );
  return splitLatencyRows(rows);
}

/**
 * Translation-only latency (total minus STT). translation_provider is null when the
 * client skipped translation entirely (detected language == selected language);
 * including those rows would drag the average toward 0 and hide real latency.
 */
async function queryTranslationLatency(range: AdminDashboardDateRange): Promise<{ avg: DailyRow[]; p95: DailyRow[] }> {
  const rows = await prisma.$queryRawUnsafe<RawDayLatency[]>(
    `select
       ${DAY_BUCKET_EXPR("created_at")} as day,
       avg("total_duration_ms" - "stt_duration_ms") as avg_ms,
       percentile_cont(0.95) within group (order by ("total_duration_ms" - "stt_duration_ms")) as p95_ms
     from "app"."app_messages"
     where "is_deleted" is distinct from true
       and "total_duration_ms" is not null
       and "stt_duration_ms" is not null
       and "total_duration_ms" >= "stt_duration_ms"
       and "translation_provider" is not null
       and "created_at" >= $1 and "created_at" < $2
     group by day
     order by day`,
    range.rangeStart,
    range.rangeEnd,
  );
  return splitLatencyRows(rows);
}

function buildMetric(args: {
  key: string;
  label: string;
  unit: string;
  kind: DashboardMetric["kind"];
  range: AdminDashboardDateRange;
  rows: DailyRow[];
  secondary?: { label: string; rows: DailyRow[] };
  fillValue: number | null;
}): DashboardMetric {
  const points = fillDailySeries(args.rows, args.range.dayKeys, args.fillValue);
  const secondarySeries = args.secondary
    ? { label: args.secondary.label, points: fillDailySeries(args.secondary.rows, args.range.dayKeys, args.fillValue) }
    : undefined;

  return {
    key: args.key,
    label: args.label,
    unit: args.unit,
    kind: args.kind,
    points,
    secondarySeries,
  };
}

export async function loadAdminDashboardMetrics(range: AdminDashboardDateRange): Promise<DashboardMetric[]> {
  const [signups, dau, messages, usageSeconds, sttLatency, translationLatency] = await Promise.all([
    querySignups(range),
    queryDau(range),
    queryMessageCount(range),
    queryUsageSeconds(range),
    querySttLatency(range),
    queryTranslationLatency(range),
  ]);

  // usage_seconds and messages lead the list -- they're the metrics that matter
  // most day-to-day, so they get the first chart slots.
  return [
    buildMetric({
      key: "usage_seconds",
      label: "사용시간",
      unit: "초",
      kind: "seconds",
      range,
      rows: usageSeconds,
      fillValue: 0,
    }),
    buildMetric({
      key: "messages",
      label: "메시지수",
      unit: "건",
      kind: "count",
      range,
      rows: messages,
      fillValue: 0,
    }),
    buildMetric({
      key: "dau",
      label: "DAU",
      unit: "명",
      kind: "count",
      range,
      rows: dau,
      fillValue: 0,
    }),
    buildMetric({
      key: "signups",
      label: "가입자수",
      unit: "명",
      kind: "count",
      range,
      rows: signups,
      fillValue: 0,
    }),
    buildMetric({
      key: "stt_latency_ms",
      label: "STT 지연시간",
      unit: "ms",
      kind: "milliseconds",
      range,
      rows: sttLatency.avg,
      secondary: { label: "p95", rows: sttLatency.p95 },
      fillValue: null,
    }),
    buildMetric({
      key: "translation_latency_ms",
      label: "번역 지연시간",
      unit: "ms",
      kind: "milliseconds",
      range,
      rows: translationLatency.avg,
      secondary: { label: "p95", rows: translationLatency.p95 },
      fillValue: null,
    }),
  ];
}

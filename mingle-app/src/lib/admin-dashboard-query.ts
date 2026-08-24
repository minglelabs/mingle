import { prisma } from "@/lib/prisma";
import {
  type AdminDashboardDateRange,
  type DailyRow,
  type DashboardMetric,
  fillDailySeries,
  formatDayKey,
  parseDayKey,
  resolveTodayKey,
  startOfDayUtc,
} from "@/lib/admin-dashboard-metrics";

/**
 * created_at is stored as naive TIMESTAMP(3) holding a UTC instant, so
 * truncating it directly buckets by UTC day -- the same basis the column
 * is already stored in, no timezone conversion needed.
 */
const DAY_BUCKET_EXPR = (column: string) => `date_trunc('day', "${column}")`;
const USAGE_METRIC_VERSION = 1;

type RawDayCount = { day: Date; value: bigint | number };
type RawDayLatency = { day: Date; avg_ms: number | null; p95_ms: number | null };

type DailyMetricSnapshot = {
  signupCount: number;
  dauCount: number;
  messageCount: number;
  usageSeconds: number;
  sttAvgMs: number | null;
  sttP95Ms: number | null;
  translationAvgMs: number | null;
  translationP95Ms: number | null;
};

type CachedDailyMetric = DailyMetricSnapshot & { day: Date; usageMetricVersion: number };

const EMPTY_DAILY_METRIC: DailyMetricSnapshot = {
  signupCount: 0,
  dauCount: 0,
  messageCount: 0,
  usageSeconds: 0,
  sttAvgMs: null,
  sttP95Ms: null,
  translationAvgMs: null,
  translationP95Ms: null,
};

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

function createCalculationRange(dayKeys: readonly string[]): AdminDashboardDateRange {
  const firstDay = dayKeys[0];
  const lastDay = dayKeys[dayKeys.length - 1];
  if (!firstDay || !lastDay) {
    throw new Error("Admin dashboard calculation requires at least one day");
  }

  const rangeStart = startOfDayUtc(firstDay);
  const rangeEnd = startOfDayUtc(lastDay);
  rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1);
  return { dayKeys: [...dayKeys], rangeStart, rangeEnd };
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

/**
 * Usage is a per-user cumulative counter in app_event_logs. Sum each positive
 * delta between snapshots, carrying the last snapshot before the range into the
 * window so the first day is not undercounted. A counter reset contributes zero.
 * This deliberately does not use app_messages duration fields: those are
 * per-turn client diagnostics and can be corrupted by a suspended/stale timer.
 */
async function queryUsageSeconds(range: AdminDashboardDateRange): Promise<DailyRow[]> {
  const rows = await prisma.$queryRawUnsafe<RawDayCount[]>(
    `with usage_in_range as materialized (
       select "user_id", "id", "created_at", "usage_sec"
       from "app"."app_event_logs"
       where "user_id" is not null
         and "usage_sec" is not null
         and "created_at" >= $1 and "created_at" < $2
     ),
     usage_users as materialized (
       select distinct "user_id"
       from usage_in_range
     ),
     usage_before_start as materialized (
       select distinct on (el."user_id")
         el."user_id", el."id", el."created_at", el."usage_sec"
       from "app"."app_event_logs" as el
       join usage_users as uu on uu."user_id" = el."user_id"
       where el."usage_sec" is not null
         and el."created_at" < $1
       order by el."user_id", el."created_at" desc, el."id" desc
     ),
     usage_events as materialized (
       select "user_id", "id", "created_at", "usage_sec"
       from usage_before_start
       union all
       select "user_id", "id", "created_at", "usage_sec"
       from usage_in_range
     ),
     usage_snapshots as (
       select
         "created_at",
         "usage_sec",
         lag("usage_sec") over (
           partition by "user_id"
           order by "created_at" asc, "id" asc
         ) as previous_usage_sec
       from usage_events
     )
     select ${DAY_BUCKET_EXPR("created_at")} as day,
       coalesce(sum(
         case
           when previous_usage_sec is null then 0::bigint
           when "usage_sec" < previous_usage_sec then 0::bigint
           else ("usage_sec" - previous_usage_sec)::bigint
         end
       ), 0)::bigint as value
     from usage_snapshots
     where "created_at" >= $1 and "created_at" < $2
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

async function queryDailyMetricSnapshots(range: AdminDashboardDateRange): Promise<Map<string, DailyMetricSnapshot>> {
  const [signups, dau, messages, usageSeconds, sttLatency, translationLatency] = await Promise.all([
    querySignups(range),
    queryDau(range),
    queryMessageCount(range),
    queryUsageSeconds(range),
    querySttLatency(range),
    queryTranslationLatency(range),
  ]);

  const snapshots = new Map<string, DailyMetricSnapshot>();
  for (const day of range.dayKeys) {
    snapshots.set(day, { ...EMPTY_DAILY_METRIC });
  }

  const applyRows = <K extends keyof DailyMetricSnapshot>(
    rows: readonly DailyRow[],
    field: K,
    normalize: (value: number | null) => DailyMetricSnapshot[K],
  ) => {
    for (const row of rows) {
      const snapshot = snapshots.get(row.day);
      if (snapshot) snapshot[field] = normalize(row.value);
    }
  };

  applyRows(signups, "signupCount", (value) => value ?? 0);
  applyRows(dau, "dauCount", (value) => value ?? 0);
  applyRows(messages, "messageCount", (value) => value ?? 0);
  applyRows(usageSeconds, "usageSeconds", (value) => value ?? 0);
  applyRows(sttLatency.avg, "sttAvgMs", (value) => value);
  applyRows(sttLatency.p95, "sttP95Ms", (value) => value);
  applyRows(translationLatency.avg, "translationAvgMs", (value) => value);
  applyRows(translationLatency.p95, "translationP95Ms", (value) => value);

  return snapshots;
}

async function loadCachedDailyMetrics(range: AdminDashboardDateRange): Promise<Map<string, CachedDailyMetric>> {
  const rows = await prisma.adminDashboardDailyMetric.findMany({
    where: {
      day: { in: range.dayKeys.map(parseDayKey) },
    },
    select: {
      day: true,
      signupCount: true,
      dauCount: true,
      messageCount: true,
      usageSeconds: true,
      sttAvgMs: true,
      sttP95Ms: true,
      translationAvgMs: true,
      translationP95Ms: true,
      usageMetricVersion: true,
    },
  });

  return new Map(
    rows
      .filter((row) => row.usageMetricVersion === USAGE_METRIC_VERSION)
      .map((row) => [formatDayKey(row.day), row]),
  );
}

function snapshotToCacheRow(dayKey: string, snapshot: DailyMetricSnapshot, now: Date) {
  return {
    day: parseDayKey(dayKey),
    ...snapshot,
    usageMetricVersion: USAGE_METRIC_VERSION,
    createdAt: now,
    updatedAt: now,
  };
}

async function persistDailyMetricSnapshots(
  snapshots: ReadonlyMap<string, DailyMetricSnapshot>,
  historicalDayKeys: readonly string[],
  currentDayKey: string | undefined,
): Promise<void> {
  const now = new Date();
  await Promise.all(historicalDayKeys.flatMap((dayKey) => {
    const snapshot = snapshots.get(dayKey);
    if (!snapshot) return [];

    return [prisma.adminDashboardDailyMetric.upsert({
      where: { day: parseDayKey(dayKey) },
      create: snapshotToCacheRow(dayKey, snapshot, now),
      update: {
        ...snapshot,
        usageMetricVersion: USAGE_METRIC_VERSION,
        updatedAt: now,
      },
    })];
  }));

  if (currentDayKey) {
    const snapshot = snapshots.get(currentDayKey);
    if (snapshot) {
      await prisma.adminDashboardDailyMetric.upsert({
        where: { day: parseDayKey(currentDayKey) },
        create: snapshotToCacheRow(currentDayKey, snapshot, now),
        update: {
          ...snapshot,
          usageMetricVersion: USAGE_METRIC_VERSION,
          updatedAt: now,
        },
      });
    }
  }
}

function snapshotFromCachedRow(row: CachedDailyMetric): DailyMetricSnapshot {
  return {
    signupCount: row.signupCount,
    dauCount: row.dauCount,
    messageCount: row.messageCount,
    usageSeconds: row.usageSeconds,
    sttAvgMs: row.sttAvgMs,
    sttP95Ms: row.sttP95Ms,
    translationAvgMs: row.translationAvgMs,
    translationP95Ms: row.translationP95Ms,
  };
}

async function resolveDailyMetricSnapshots(range: AdminDashboardDateRange): Promise<Map<string, DailyMetricSnapshot>> {
  const cachedByDay = await loadCachedDailyMetrics(range);
  const rangeEndDayKey = range.dayKeys[range.dayKeys.length - 1];
  const currentDayKey = rangeEndDayKey === resolveTodayKey(new Date()) ? rangeEndDayKey : undefined;
  const daysToCalculate = range.dayKeys.filter((dayKey) => dayKey === currentDayKey || !cachedByDay.has(dayKey));

  if (daysToCalculate.length > 0) {
    const calculated = await queryDailyMetricSnapshots(createCalculationRange(daysToCalculate));
    const historicalDayKeys = daysToCalculate.filter((dayKey) => dayKey !== currentDayKey);
    await persistDailyMetricSnapshots(calculated, historicalDayKeys, currentDayKey);

    for (const dayKey of daysToCalculate) {
      const snapshot = calculated.get(dayKey);
      if (snapshot) {
        cachedByDay.set(dayKey, {
          day: parseDayKey(dayKey),
          ...snapshot,
          usageMetricVersion: USAGE_METRIC_VERSION,
        });
      }
    }
  }

  return new Map(range.dayKeys.map((dayKey) => [
    dayKey,
    cachedByDay.get(dayKey) ? snapshotFromCachedRow(cachedByDay.get(dayKey)!) : { ...EMPTY_DAILY_METRIC },
  ]));
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
  const snapshots = await resolveDailyMetricSnapshots(range);
  const dailyRows = <K extends keyof DailyMetricSnapshot>(field: K): DailyRow[] => range.dayKeys.map((day) => ({
    day,
    value: snapshots.get(day)?.[field] ?? null,
  }));
  const sttAvg = dailyRows("sttAvgMs");
  const sttP95 = dailyRows("sttP95Ms");
  const translationAvg = dailyRows("translationAvgMs");
  const translationP95 = dailyRows("translationP95Ms");

  // usage_seconds and messages lead the list -- they're the metrics that matter
  // most day-to-day, so they get the first chart slots.
  return [
    buildMetric({
      key: "usage_seconds",
      label: "사용시간",
      unit: "초",
      kind: "seconds",
      range,
      rows: dailyRows("usageSeconds"),
      fillValue: 0,
    }),
    buildMetric({
      key: "messages",
      label: "메시지수",
      unit: "건",
      kind: "count",
      range,
      rows: dailyRows("messageCount"),
      fillValue: 0,
    }),
    buildMetric({
      key: "dau",
      label: "DAU",
      unit: "명",
      kind: "count",
      range,
      rows: dailyRows("dauCount"),
      fillValue: 0,
    }),
    buildMetric({
      key: "signups",
      label: "가입자수",
      unit: "명",
      kind: "count",
      range,
      rows: dailyRows("signupCount"),
      fillValue: 0,
    }),
    buildMetric({
      key: "stt_latency_ms",
      label: "STT 지연시간",
      unit: "ms",
      kind: "milliseconds",
      range,
      rows: sttAvg,
      secondary: { label: "p95", rows: sttP95 },
      fillValue: null,
    }),
    buildMetric({
      key: "translation_latency_ms",
      label: "번역 지연시간",
      unit: "ms",
      kind: "milliseconds",
      range,
      rows: translationAvg,
      secondary: { label: "p95", rows: translationP95 },
      fillValue: null,
    }),
  ];
}

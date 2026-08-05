import { adminDashboardPrisma as prisma } from "@/lib/admin-dashboard-prisma";
import {
  ADMIN_DASHBOARD_TIME_ZONE,
  type AdminDashboardRange,
  type DailyPoint,
  type DailyRow,
  type DashboardMetric,
  averageSeries,
  enumerateDayKeys,
  fillDailySeries,
  resolveTodayKey,
  startOfDayUtc,
  sumSeries,
} from "@/lib/admin-dashboard-metrics";

/** How far back (beyond the display range) to fetch, so "vs 7 days ago" has a baseline
 * even when the display range itself is the minimum 7-day option. */
const COMPARISON_LOOKBACK_DAYS = 7;

/**
 * created_at is stored as naive TIMESTAMP(3) holding a UTC instant, so
 * truncating it directly buckets by UTC day -- the same basis the column
 * is already stored in, no timezone conversion needed.
 */
const DAY_BUCKET_EXPR = (column: string) => `date_trunc('day', "${column}")`;

type RawDayCount = { day: Date; value: bigint | number };
type RawDayAvg = { day: Date; value: number | null };
type RawDayLatency = { day: Date; avg_ms: number | null; p95_ms: number | null };

function toDailyRows(rows: readonly RawDayCount[]): DailyRow[] {
  return rows.map((row) => ({ day: dayKeyFromRaw(row.day), value: Number(row.value) }));
}

function toDailyAvgRows(rows: readonly RawDayAvg[]): DailyRow[] {
  return rows.map((row) => ({ day: dayKeyFromRaw(row.day), value: row.value === null ? null : Number(row.value) }));
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

type RangeBounds = {
  /** Days actually charted/shown in the table. */
  displayDayKeys: string[];
  /** displayDayKeys plus COMPARISON_LOOKBACK_DAYS of lead-in, used only to compute "vs N days ago". */
  extendedDayKeys: string[];
  rangeStart: Date;
  rangeEnd: Date;
};

function resolveRange(now: Date, days: AdminDashboardRange): RangeBounds {
  const todayKey = resolveTodayKey(now, ADMIN_DASHBOARD_TIME_ZONE);
  const extendedDayKeys = enumerateDayKeys(todayKey, days + COMPARISON_LOOKBACK_DAYS);
  const displayDayKeys = extendedDayKeys.slice(COMPARISON_LOOKBACK_DAYS);
  const rangeStart = startOfDayUtc(extendedDayKeys[0]);
  const rangeEnd = startOfDayUtc(todayKey);
  rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1);
  return { displayDayKeys, extendedDayKeys, rangeStart, rangeEnd };
}

async function querySignups(range: RangeBounds): Promise<DailyRow[]> {
  const rows = await prisma.$queryRawUnsafe<RawDayCount[]>(
    `select ${DAY_BUCKET_EXPR("created_at")} as day, count(*) as value
     from "app"."app_users"
     where "created_at" >= $1 and "created_at" < $2
     group by day
     order by day`,
    range.rangeStart,
    range.rangeEnd,
  );
  return toDailyRows(rows);
}

async function queryDau(range: RangeBounds): Promise<DailyRow[]> {
  const rows = await prisma.$queryRawUnsafe<RawDayCount[]>(
    `select ${DAY_BUCKET_EXPR("created_at")} as day, count(distinct "user_id") as value
     from "app"."app_event_logs"
     where "event_type" = 'stt_session_started'
       and "user_id" is not null
       and "created_at" >= $1 and "created_at" < $2
     group by day
     order by day`,
    range.rangeStart,
    range.rangeEnd,
  );
  return toDailyRows(rows);
}

async function queryMessageCount(range: RangeBounds): Promise<DailyRow[]> {
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

async function queryUsageSeconds(range: RangeBounds): Promise<DailyRow[]> {
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
async function querySttLatency(range: RangeBounds): Promise<{ avg: DailyRow[]; p95: DailyRow[] }> {
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
async function queryTranslationLatency(range: RangeBounds): Promise<{ avg: DailyRow[]; p95: DailyRow[] }> {
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

function trimToDisplayRange(points: readonly DailyPoint[], displayDays: number): DailyPoint[] {
  return points.slice(points.length - displayDays);
}

function buildMetric(args: {
  key: string;
  label: string;
  unit: string;
  kind: DashboardMetric["kind"];
  lowerIsBetter: boolean;
  range: RangeBounds;
  rows: DailyRow[];
  secondary?: { label: string; rows: DailyRow[] };
  fillValue: number | null;
  summaryLabel: string;
}): DashboardMetric {
  const extendedPoints = fillDailySeries(args.rows, args.range.extendedDayKeys, args.fillValue);
  const displayDays = args.range.displayDayKeys.length;
  const points = trimToDisplayRange(extendedPoints, displayDays);

  const latest = extendedPoints[extendedPoints.length - 1]?.value ?? null;
  const previousIndex = extendedPoints.length - 1 - COMPARISON_LOOKBACK_DAYS;
  const previous = previousIndex >= 0 ? extendedPoints[previousIndex].value : null;

  const secondarySeries = args.secondary
    ? {
      label: args.secondary.label,
      points: trimToDisplayRange(fillDailySeries(args.secondary.rows, args.range.extendedDayKeys, args.fillValue), displayDays),
    }
    : undefined;

  return {
    key: args.key,
    label: args.label,
    unit: args.unit,
    kind: args.kind,
    lowerIsBetter: args.lowerIsBetter,
    points,
    secondarySeries,
    latest,
    previous,
    previousLabel: `${COMPARISON_LOOKBACK_DAYS}일 전 대비`,
    summaryLabel: args.summaryLabel,
    summaryValue: args.kind === "milliseconds" ? averageSeries(points) : sumSeries(points),
  };
}

export async function loadAdminDashboardMetrics(args: {
  now: Date;
  days: AdminDashboardRange;
}): Promise<DashboardMetric[]> {
  const range = resolveRange(args.now, args.days);

  const [signups, dau, messages, usageSeconds, sttLatency, translationLatency] = await Promise.all([
    querySignups(range),
    queryDau(range),
    queryMessageCount(range),
    queryUsageSeconds(range),
    querySttLatency(range),
    queryTranslationLatency(range),
  ]);

  return [
    buildMetric({
      key: "signups",
      label: "가입자수",
      unit: "명",
      kind: "count",
      lowerIsBetter: false,
      range,
      rows: signups,
      fillValue: 0,
      summaryLabel: "기간 누적 가입자",
    }),
    buildMetric({
      key: "dau",
      label: "DAU",
      unit: "명",
      kind: "count",
      lowerIsBetter: false,
      range,
      rows: dau,
      fillValue: 0,
      summaryLabel: "기간 평균 DAU",
    }),
    buildMetric({
      key: "messages",
      label: "메시지수",
      unit: "건",
      kind: "count",
      lowerIsBetter: false,
      range,
      rows: messages,
      fillValue: 0,
      summaryLabel: "기간 누적 메시지",
    }),
    buildMetric({
      key: "usage_seconds",
      label: "사용시간",
      unit: "초",
      kind: "seconds",
      lowerIsBetter: false,
      range,
      rows: usageSeconds,
      fillValue: 0,
      summaryLabel: "기간 누적 사용시간",
    }),
    buildMetric({
      key: "stt_latency_ms",
      label: "STT 지연시간",
      unit: "ms",
      kind: "milliseconds",
      lowerIsBetter: true,
      range,
      rows: sttLatency.avg,
      secondary: { label: "p95", rows: sttLatency.p95 },
      fillValue: null,
      summaryLabel: "기간 평균 STT 지연시간",
    }),
    buildMetric({
      key: "translation_latency_ms",
      label: "번역 지연시간",
      unit: "ms",
      kind: "milliseconds",
      lowerIsBetter: true,
      range,
      rows: translationLatency.avg,
      secondary: { label: "p95", rows: translationLatency.p95 },
      fillValue: null,
      summaryLabel: "기간 평균 번역 지연시간",
    }),
  ];
}

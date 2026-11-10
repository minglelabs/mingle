import { prisma } from "@/lib/prisma";
import {
  ADMIN_DASHBOARD_TIME_ZONE,
  type AdminDashboardDateRange,
  type AdminDashboardPlatform,
  buildTranslationModelSeries,
  type DailyRow,
  type DashboardMetric,
  formatDayKey,
  parseDayKey,
  resolveUncacheableDayKeys,
  shiftDayKey,
  startOfDayUtc,
  type TranslationModelDailyRow,
  type TranslationModelSeries,
} from "@/lib/admin-dashboard-metrics";
import {
  buildUsageMetricSeries,
  emptyUsageMetricValues,
  toDashboardMetric,
  type UsageMetricDayValue,
  type UsageMetricDays,
  type UsageMetricKey,
  type UsageMetricPart,
  type UsageMetricPartResult,
  type UsageMetricValues,
} from "@/lib/admin-dashboard-usage";

/**
 * created_at is stored as naive TIMESTAMP(3) holding a UTC instant, so
 * truncating it directly buckets by UTC day -- the same basis the column
 * is already stored in, no timezone conversion needed.
 */
const DAY_BUCKET_EXPR = (alias: string) => `date_trunc('day', ${alias}."created_at")`;
/** Bumped whenever a cached column is added or its source query changes, so old rows rebuild.
 * 3: per-character STT and per-token translation latency. */
const USAGE_METRIC_VERSION = 3;
/**
 * Missing cacheable days are computed this many at a time: each metric's query runs over
 * the chunks one after another, and a chunk is stored as soon as all of its metrics are
 * computed. After a USAGE_METRIC_VERSION bump every row is stale, and computing 30 days as
 * one batch ran past the launcher's 120s proxy timeout in production while storing
 * nothing, so every retry started over. Storing per chunk keeps the finished days when a
 * request is cut off, and the next load computes only the days still missing.
 */
export const DAILY_METRIC_CACHE_CHUNK_DAYS = 4;

type RawDayCount = { day: Date; value: bigint | number };
type RawDayModelCount = { day: Date; model: string; value: bigint | number };
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
  sttMsPerCharAvg: number | null;
  sttMsPerCharP95: number | null;
  translationMsPerTokenAvg: number | null;
  translationMsPerTokenP95: number | null;
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
  sttMsPerCharAvg: null,
  sttMsPerCharP95: null,
  translationMsPerTokenAvg: null,
  translationMsPerTokenP95: null,
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

function buildPlatformFilter(platform: AdminDashboardPlatform, userAlias = "u"): string {
  return platform === "all" ? "" : `\n       and ${userAlias}."latest_client_platform" = $3`;
}

function buildQueryParams(
  range: AdminDashboardDateRange,
  platform: AdminDashboardPlatform,
): [Date, Date] | [Date, Date, AdminDashboardPlatform] {
  return platform === "all"
    ? [range.rangeStart, range.rangeEnd]
    : [range.rangeStart, range.rangeEnd, platform];
}

function buildMessageUserJoin(platform: AdminDashboardPlatform, messageAlias = "m"): string {
  return platform === "all"
    ? ""
    : `\n     join "app"."app_users" as u on u."id" = ${messageAlias}."user_id"`;
}

/**
 * Operator accounts (`is_operator`) are staff-run personas, so what they send
 * is not product usage: every app_messages metric drops their rows. NOT EXISTS
 * (not NOT IN) keeps messages whose user_id is null, which the message count
 * includes. Usage seconds need no filter: operators have no client sessions,
 * so they never write app_event_logs.
 */
function excludeOperatorSenders(messageAlias = "m"): string {
  return `\n       and not exists (select 1 from "app"."app_users" as op where op."id" = ${messageAlias}."user_id" and op."is_operator")`;
}

/**
 * upsertTrackedUser (src/lib/app-analytics.ts) creates an app_users row keyed only by
 * externalUserId for anyone who fires a tracked client event, before they ever sign up
 * -- counting every row here would report anonymous demo visitors as 가입자/signups.
 * A real account always has either a password (email/password signup) or a linked
 * auth_accounts row (Google/Apple OAuth, including the native bridge flow, which both
 * go through the same NextAuth PrismaAdapter user-creation path); anonymous tracking
 * rows have neither. Operator accounts are excluded explicitly as well (they are
 * created without a password or auth account today, so this only guards a future
 * path that gives them one).
 */
async function querySignups(
  range: AdminDashboardDateRange,
  platform: AdminDashboardPlatform,
): Promise<DailyRow[]> {
  const rows = await prisma.$queryRawUnsafe<RawDayCount[]>(
    `select ${DAY_BUCKET_EXPR("u")} as day, count(*) as value
     from "app"."app_users" as u
     where u."created_at" >= $1 and u."created_at" < $2
       and u."is_operator" = false
       and (
         u."password_hash" is not null
         or exists (select 1 from "app"."auth_accounts" as a where a."user_id" = u."id")
       )${buildPlatformFilter(platform)}
     group by day
     order by day`,
    ...buildQueryParams(range, platform),
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
async function queryDau(
  range: AdminDashboardDateRange,
  platform: AdminDashboardPlatform,
): Promise<DailyRow[]> {
  const rows = await prisma.$queryRawUnsafe<RawDayCount[]>(
    `select ${DAY_BUCKET_EXPR("m")} as day, count(distinct m."user_id") as value
     from "app"."app_messages" as m${buildMessageUserJoin(platform)}
     where m."is_deleted" is distinct from true
       and m."user_id" is not null
       and m."created_at" >= $1 and m."created_at" < $2${excludeOperatorSenders()}${buildPlatformFilter(platform)}
     group by day
     order by day`,
    ...buildQueryParams(range, platform),
  );
  return toDailyRows(rows);
}

/**
 * FROM + WHERE shared by every message-count query: rows that are not deleted, created in
 * [$1, $2), and -- under a platform filter -- sent by a user last seen on that platform
 * ($3). `extraConditions` are ANDed on after those. Building each count query on this one
 * source keeps their filters from drifting apart.
 */
function buildMessageCountSource(platform: AdminDashboardPlatform, extraConditions: readonly string[] = []): string {
  const extra = extraConditions.map((condition) => `\n       and ${condition}`).join("");
  return `from "app"."app_messages" as m${buildMessageUserJoin(platform)}
     where m."is_deleted" is distinct from true
       and m."created_at" >= $1 and m."created_at" < $2${excludeOperatorSenders()}${buildPlatformFilter(platform)}${extra}`;
}

async function queryMessageCount(
  range: AdminDashboardDateRange,
  platform: AdminDashboardPlatform,
): Promise<DailyRow[]> {
  const rows = await prisma.$queryRawUnsafe<RawDayCount[]>(
    `select ${DAY_BUCKET_EXPR("m")} as day, count(*) as value
     ${buildMessageCountSource(platform)}
     group by day
     order by day`,
    ...buildQueryParams(range, platform),
  );
  return toDailyRows(rows);
}

/**
 * translation_model is the model string the client reported with its stt_turn_finalized
 * event, copied from the finalize response it got; the server stores it as sent (trimmed
 * and length-capped) without checking it against what actually ran. Folded case- and
 * space-insensitively here, before buildTranslationModelSeries canonicalizes it.
 */
const TRANSLATION_MODEL_EXPR = `lower(btrim(m."translation_model"))`;

/**
 * Messages per day per reported translation model, with queryMessageCount's filters. The
 * model is NULL when the turn was not translated, so untranslated messages drop out here.
 */
async function queryTranslationModelMessageCounts(
  range: AdminDashboardDateRange,
  platform: AdminDashboardPlatform,
): Promise<TranslationModelDailyRow[]> {
  const rows = await prisma.$queryRawUnsafe<RawDayModelCount[]>(
    `select ${DAY_BUCKET_EXPR("m")} as day, ${TRANSLATION_MODEL_EXPR} as model, count(*) as value
     ${buildMessageCountSource(platform, [`m."translation_model" is not null`])}
     group by day, ${TRANSLATION_MODEL_EXPR}
     order by day, model`,
    ...buildQueryParams(range, platform),
  );
  return rows.map((row) => ({ day: dayKeyFromRaw(row.day), model: row.model, value: Number(row.value) }));
}

/**
 * Daily message counts per translation model for the range. Always a live query, never
 * the adminDashboardDailyMetric cache: that table has no per-model columns, and adding
 * them would need a production migration, which is applied by hand.
 */
export async function loadTranslationModelMessageSeries(
  range: AdminDashboardDateRange,
  options?: Pick<LoadAdminDashboardOptions, "platform">,
): Promise<TranslationModelSeries[]> {
  const rows = await queryTranslationModelMessageCounts(range, options?.platform ?? "all");
  return buildTranslationModelSeries(rows, range.dayKeys);
}

/**
 * Usage is a cumulative counter scoped to a client session (a conversation for
 * current clients), not one global counter per user. Client-event requests are
 * asynchronous and can arrive out of order, so first collapse each
 * user/session/day to its high-water mark. Differencing every raw event would
 * otherwise both mix counters from separate rooms and recount stale retries.
 * Carry the last snapshot before the range into the window. When a session has
 * no earlier snapshot, use its first in-range observation as a conservative
 * baseline so new sessions still retain their within-day increment without
 * imputing use before their first event. Non-null and legacy null session keys
 * use separate baseline branches so each lookup remains indexable. A counter
 * reset contributes zero. This deliberately does not use app_messages duration
 * fields: those are per-turn client diagnostics and can be corrupted by a
 * suspended/stale timer.
 */
async function queryUsageSeconds(
  range: AdminDashboardDateRange,
  platform: AdminDashboardPlatform,
): Promise<DailyRow[]> {
  const rows = await prisma.$queryRawUnsafe<RawDayCount[]>(
    `with usage_in_range as materialized (
       select
         el."user_id",
         el."session_key",
         date_trunc('day', el."created_at") as day,
         max(el."usage_sec") as "usage_sec",
         (array_agg(el."usage_sec" order by el."created_at" asc, el."id" asc))[1] as "first_usage_sec"
       from "app"."app_event_logs" as el${platform === "all" ? "" : "\n       join \"app\".\"app_users\" as u on u.\"id\" = el.\"user_id\""}
       where el."user_id" is not null
         and el."usage_sec" is not null
         and el."created_at" >= $1 and el."created_at" < $2${buildPlatformFilter(platform)}
       group by el."user_id", el."session_key", date_trunc('day', el."created_at")
     ),
     usage_first_in_range as materialized (
       select "user_id", "session_key", "first_usage_sec"
       from (
         select
           "user_id",
           "session_key",
           "first_usage_sec",
           row_number() over (
             partition by "user_id", "session_key"
             order by day asc
           ) as snapshot_rank
         from usage_in_range
       ) as ranked
       where snapshot_rank = 1
     ),
     usage_before_start as materialized (
       select
         first."user_id",
         first."session_key",
         ($1::timestamp - interval '1 day') as day,
         coalesce(baseline."usage_sec", first."first_usage_sec") as "usage_sec"
       from usage_first_in_range as first
       left join lateral (
         select el."usage_sec"
         from "app"."app_event_logs" as el
         where el."user_id" = first."user_id"
           and el."session_key" = first."session_key"
           and el."usage_sec" is not null
           and el."created_at" < $1
         order by el."created_at" desc, el."id" desc
         limit 1
       ) as baseline on true
       where first."session_key" is not null
       union all
       select
         first."user_id",
         first."session_key",
         ($1::timestamp - interval '1 day') as day,
         coalesce(baseline."usage_sec", first."first_usage_sec") as "usage_sec"
       from usage_first_in_range as first
       left join lateral (
         select el."usage_sec"
         from "app"."app_event_logs" as el
         where el."user_id" = first."user_id"
           and el."session_key" is null
           and el."usage_sec" is not null
           and el."created_at" < $1
         order by el."created_at" desc, el."id" desc
         limit 1
       ) as baseline on true
       where first."session_key" is null
     ),
     usage_daily as materialized (
       select "user_id", "session_key", day, "usage_sec"
       from usage_before_start
       union all
       select "user_id", "session_key", day, "usage_sec"
       from usage_in_range
     ),
     usage_snapshots as (
       select
         day,
         "usage_sec",
         lag("usage_sec") over (
           partition by "user_id", "session_key"
           order by day asc
         ) as previous_usage_sec
       from usage_daily
     )
     select day,
       coalesce(sum(
         case
           when previous_usage_sec is null then 0::bigint
           when "usage_sec" < previous_usage_sec then 0::bigint
           else ("usage_sec" - previous_usage_sec)::bigint
         end
       ), 0)::bigint as value
     from usage_snapshots
     where day >= $1 and day < $2
     group by day
     order by day`,
    ...buildQueryParams(range, platform),
  );
  return toDailyRows(rows);
}

/** STT-only latency: every finalized message has this regardless of whether translation ran. */
async function querySttLatency(
  range: AdminDashboardDateRange,
  platform: AdminDashboardPlatform,
): Promise<{ avg: DailyRow[]; p95: DailyRow[] }> {
  const rows = await prisma.$queryRawUnsafe<RawDayLatency[]>(
    `select
       ${DAY_BUCKET_EXPR("m")} as day,
       avg(m."stt_duration_ms") as avg_ms,
       percentile_cont(0.95) within group (order by m."stt_duration_ms") as p95_ms
     from "app"."app_messages" as m${buildMessageUserJoin(platform)}
     where m."is_deleted" is distinct from true
       and m."stt_duration_ms" is not null
       and m."created_at" >= $1 and m."created_at" < $2${excludeOperatorSenders()}${buildPlatformFilter(platform)}
     group by day
     order by day`,
    ...buildQueryParams(range, platform),
  );
  return splitLatencyRows(rows);
}

/**
 * Translation-only latency (total minus STT). translation_provider is null when the
 * client skipped translation entirely (detected language == selected language);
 * including those rows would drag the average toward 0 and hide real latency.
 */
async function queryTranslationLatency(
  range: AdminDashboardDateRange,
  platform: AdminDashboardPlatform,
): Promise<{ avg: DailyRow[]; p95: DailyRow[] }> {
  const rows = await prisma.$queryRawUnsafe<RawDayLatency[]>(
    `select
       ${DAY_BUCKET_EXPR("m")} as day,
       avg(m."total_duration_ms" - m."stt_duration_ms") as avg_ms,
       percentile_cont(0.95) within group (order by (m."total_duration_ms" - m."stt_duration_ms")) as p95_ms
     from "app"."app_messages" as m${buildMessageUserJoin(platform)}
     where m."is_deleted" is distinct from true
       and m."total_duration_ms" is not null
       and m."stt_duration_ms" is not null
       and m."total_duration_ms" >= m."stt_duration_ms"
       and m."translation_provider" is not null
       and m."created_at" >= $1 and m."created_at" < $2${excludeOperatorSenders()}${buildPlatformFilter(platform)}
     group by day
     order by day`,
    ...buildQueryParams(range, platform),
  );
  return splitLatencyRows(rows);
}

/**
 * Short utterances are mostly fixed overhead ("네" can take 2s), so a per-character
 * figure below this many characters says nothing about speed and is left out.
 */
const MIN_CHARS_FOR_PER_CHAR_LATENCY = 5;

/**
 * STT time per character of the recognized source text. The average is weighted
 * (total ms / total characters) so a few slow short turns cannot swing it; p95 is
 * over each message's own ratio. Joins the SOURCE content row, which makes this the
 * slowest dashboard query (~50s for 30 days in production) -- fine because past
 * days are cached.
 */
async function querySttLatencyPerChar(
  range: AdminDashboardDateRange,
  platform: AdminDashboardPlatform,
): Promise<{ avg: DailyRow[]; p95: DailyRow[] }> {
  const rows = await prisma.$queryRawUnsafe<RawDayLatency[]>(
    `select
       day,
       sum(stt_ms) / sum(chars) as avg_ms,
       percentile_cont(0.95) within group (order by stt_ms / chars) as p95_ms
     from (
       select ${DAY_BUCKET_EXPR("m")} as day, m."stt_duration_ms"::float8 as stt_ms, char_length(btrim(c."text"))::float8 as chars
       from "app"."app_messages" as m${buildMessageUserJoin(platform)}
       join "app"."app_message_contents" as c on c."message_id" = m."id" and c."content_type" = 'SOURCE'
       where m."is_deleted" is distinct from true
         and m."stt_duration_ms" > 0
         and m."created_at" >= $1 and m."created_at" < $2${excludeOperatorSenders()}${buildPlatformFilter(platform)}
     ) as turns
     where chars >= ${MIN_CHARS_FOR_PER_CHAR_LATENCY}
     group by day
     order by day`,
    ...buildQueryParams(range, platform),
  );
  return splitLatencyRows(rows);
}

/**
 * Translation time (total minus STT) per output token the model reported, on the same
 * rows as queryTranslationLatency. Weighted average plus per-message p95, as above.
 */
async function queryTranslationLatencyPerToken(
  range: AdminDashboardDateRange,
  platform: AdminDashboardPlatform,
): Promise<{ avg: DailyRow[]; p95: DailyRow[] }> {
  const rows = await prisma.$queryRawUnsafe<RawDayLatency[]>(
    `select
       ${DAY_BUCKET_EXPR("m")} as day,
       sum(m."total_duration_ms" - m."stt_duration_ms")::float8 / sum(m."translation_completion_tokens") as avg_ms,
       percentile_cont(0.95) within group (
         order by (m."total_duration_ms" - m."stt_duration_ms")::float8 / m."translation_completion_tokens"
       ) as p95_ms
     from "app"."app_messages" as m${buildMessageUserJoin(platform)}
     where m."is_deleted" is distinct from true
       and m."total_duration_ms" is not null
       and m."stt_duration_ms" is not null
       and m."total_duration_ms" >= m."stt_duration_ms"
       and m."translation_provider" is not null
       and m."translation_completion_tokens" > 0
       and m."created_at" >= $1 and m."created_at" < $2${excludeOperatorSenders()}${buildPlatformFilter(platform)}
     group by day
     order by day`,
    ...buildQueryParams(range, platform),
  );
  return splitLatencyRows(rows);
}

/** The snapshot fields one metric's query filled, by day key. A day without rows is absent. */
type SnapshotPatches = Map<string, Partial<DailyMetricSnapshot>>;

type UsageMetricQuery = {
  /** Runs the metric's query over one contiguous range of days. */
  run: (range: AdminDashboardDateRange, platform: AdminDashboardPlatform) => Promise<SnapshotPatches>;
  /** The metric's value on a day, as the dashboard shows it. */
  read: (snapshot: DailyMetricSnapshot) => UsageMetricDayValue;
};

function countPatches(rows: readonly DailyRow[], toPatch: (value: number) => Partial<DailyMetricSnapshot>): SnapshotPatches {
  return new Map(rows.map((row) => [row.day, toPatch(row.value ?? 0)]));
}

function latencyPatches(
  rows: { avg: readonly DailyRow[]; p95: readonly DailyRow[] },
  toPatch: (avg: number | null, p95: number | null) => Partial<DailyMetricSnapshot>,
): SnapshotPatches {
  const p95ByDay = new Map(rows.p95.map((row) => [row.day, row.value]));
  return new Map(rows.avg.map((row) => [row.day, toPatch(row.value, p95ByDay.get(row.day) ?? null)]));
}

/**
 * Each dashboard metric's source query and its cache columns, keyed by metric so a metric
 * without its query is a type error. Listed in the order the queries start.
 */
const USAGE_METRIC_QUERIES: Record<UsageMetricKey, UsageMetricQuery> = {
  signups: {
    run: async (range, platform) => countPatches(await querySignups(range, platform), (signupCount) => ({ signupCount })),
    read: (snapshot) => ({ value: snapshot.signupCount ?? null, secondary: null }),
  },
  dau: {
    run: async (range, platform) => countPatches(await queryDau(range, platform), (dauCount) => ({ dauCount })),
    read: (snapshot) => ({ value: snapshot.dauCount ?? null, secondary: null }),
  },
  messages: {
    run: async (range, platform) => countPatches(await queryMessageCount(range, platform), (messageCount) => ({ messageCount })),
    read: (snapshot) => ({ value: snapshot.messageCount ?? null, secondary: null }),
  },
  usage_seconds: {
    run: async (range, platform) => countPatches(await queryUsageSeconds(range, platform), (usageSeconds) => ({ usageSeconds })),
    read: (snapshot) => ({ value: snapshot.usageSeconds ?? null, secondary: null }),
  },
  stt_latency_ms: {
    run: async (range, platform) => latencyPatches(
      await querySttLatency(range, platform),
      (sttAvgMs, sttP95Ms) => ({ sttAvgMs, sttP95Ms }),
    ),
    read: (snapshot) => ({ value: snapshot.sttAvgMs ?? null, secondary: snapshot.sttP95Ms ?? null }),
  },
  translation_latency_ms: {
    run: async (range, platform) => latencyPatches(
      await queryTranslationLatency(range, platform),
      (translationAvgMs, translationP95Ms) => ({ translationAvgMs, translationP95Ms }),
    ),
    read: (snapshot) => ({ value: snapshot.translationAvgMs ?? null, secondary: snapshot.translationP95Ms ?? null }),
  },
  stt_latency_ms_per_char: {
    run: async (range, platform) => latencyPatches(
      await querySttLatencyPerChar(range, platform),
      (sttMsPerCharAvg, sttMsPerCharP95) => ({ sttMsPerCharAvg, sttMsPerCharP95 }),
    ),
    read: (snapshot) => ({ value: snapshot.sttMsPerCharAvg ?? null, secondary: snapshot.sttMsPerCharP95 ?? null }),
  },
  translation_latency_ms_per_token: {
    run: async (range, platform) => latencyPatches(
      await queryTranslationLatencyPerToken(range, platform),
      (translationMsPerTokenAvg, translationMsPerTokenP95) => ({ translationMsPerTokenAvg, translationMsPerTokenP95 }),
    ),
    read: (snapshot) => ({
      value: snapshot.translationMsPerTokenAvg ?? null,
      secondary: snapshot.translationMsPerTokenP95 ?? null,
    }),
  },
};

const USAGE_METRIC_QUERY_ORDER = Object.keys(USAGE_METRIC_QUERIES) as UsageMetricKey[];

function groupContiguousDayKeys(dayKeys: readonly string[]): string[][] {
  const sortedDayKeys = [...new Set(dayKeys)].sort();
  const groups: string[][] = [];

  for (const dayKey of sortedDayKeys) {
    const currentGroup = groups[groups.length - 1];
    const previousDayKey = currentGroup?.[currentGroup.length - 1];
    if (!currentGroup || !previousDayKey || shiftDayKey(previousDayKey, 1) !== dayKey) {
      groups.push([dayKey]);
    } else {
      currentGroup.push(dayKey);
    }
  }

  return groups;
}

/** Each contiguous run of dayKeys, split into chunks of at most `chunkDays` days. */
function chunkContiguousDayKeys(dayKeys: readonly string[], chunkDays: number): string[][] {
  return groupContiguousDayKeys(dayKeys).flatMap((group) => {
    const chunks: string[][] = [];
    for (let start = 0; start < group.length; start += chunkDays) {
      chunks.push(group.slice(start, start + chunkDays));
    }
    return chunks;
  });
}

async function loadCachedDailyMetrics(
  range: AdminDashboardDateRange,
  platform: AdminDashboardPlatform,
): Promise<Map<string, CachedDailyMetric>> {
  const rows = await prisma.adminDashboardDailyMetric.findMany({
    where: {
      day: { in: range.dayKeys.map(parseDayKey) },
      platform,
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
      sttMsPerCharAvg: true,
      sttMsPerCharP95: true,
      translationMsPerTokenAvg: true,
      translationMsPerTokenP95: true,
      usageMetricVersion: true,
    },
  });

  return new Map(
    rows
      .filter((row) => row.usageMetricVersion === USAGE_METRIC_VERSION)
      .map((row) => [formatDayKey(row.day), row]),
  );
}

function snapshotToCacheRow(
  dayKey: string,
  snapshot: DailyMetricSnapshot,
  platform: AdminDashboardPlatform,
  now: Date,
) {
  return {
    day: parseDayKey(dayKey),
    platform,
    ...snapshot,
    usageMetricVersion: USAGE_METRIC_VERSION,
    createdAt: now,
    updatedAt: now,
  };
}

async function persistDailyMetricSnapshots(
  snapshots: ReadonlyMap<string, DailyMetricSnapshot>,
  historicalDayKeys: readonly string[],
  platform: AdminDashboardPlatform,
): Promise<void> {
  const now = new Date();
  await Promise.all(historicalDayKeys.map(async (dayKey) => {
    const snapshot = snapshots.get(dayKey);
    if (!snapshot) return;

    await prisma.adminDashboardDailyMetric.upsert({
      where: {
        day_platform: {
          day: parseDayKey(dayKey),
          platform,
        },
      },
      create: snapshotToCacheRow(dayKey, snapshot, platform, now),
      update: {
        ...snapshot,
        usageMetricVersion: USAGE_METRIC_VERSION,
        updatedAt: now,
      },
    });
  }));
}

/** Days computed together: a cache chunk, which is stored, or today and yesterday, which never are. */
type MetricBatch = { dayKeys: string[]; store: boolean };

/**
 * One metric's query over every batch, one batch after another. At most one query per
 * metric runs at a time, so a load never has more queries in flight than there are
 * metrics, the same as when the eight ran side by side for one chunk. After a failure the
 * metric's later batches are not queried and fail with the same error; the other metrics
 * go on.
 */
function runMetricPipeline(
  metric: UsageMetricKey,
  batches: readonly MetricBatch[],
  platform: AdminDashboardPlatform,
): Promise<SnapshotPatches>[] {
  let previous: Promise<unknown> = Promise.resolve();
  return batches.map((batch) => {
    const patches = previous.then(() => USAGE_METRIC_QUERIES[metric]
      .run(createCalculationRange(batch.dayKeys), platform)
      .catch((error: unknown) => {
        console.error("[admin-dashboard] usage_metric_failed", { metric, dayKeys: batch.dayKeys, platform }, error);
        throw error;
      }));
    previous = patches;
    return patches;
  });
}

/** A day's full snapshot from every metric's patches; a metric without rows that day keeps the empty value. */
function mergeSnapshot(day: string, patchesByMetric: readonly SnapshotPatches[]): DailyMetricSnapshot {
  const snapshot: DailyMetricSnapshot = { ...EMPTY_DAILY_METRIC };
  for (const patches of patchesByMetric) Object.assign(snapshot, patches.get(day));
  return snapshot;
}

function toDayValues(metric: UsageMetricKey, dayKeys: readonly string[], patches: SnapshotPatches): UsageMetricDays {
  const { read } = USAGE_METRIC_QUERIES[metric];
  return Object.fromEntries(dayKeys.map((day) => [day, read({ ...EMPTY_DAILY_METRIC, ...patches.get(day) })]));
}

/**
 * Starts computing the batches. Every metric runs its own pipeline (runMetricPipeline), so
 * a fast query such as signups never waits for the slowest one (STT per character). A
 * cache chunk is stored as soon as all of its metrics are computed, and never with one
 * missing, so a load that is cut off keeps every finished chunk and the next load computes
 * only the days still missing.
 */
function computeDailyMetricBatches(
  batches: readonly MetricBatch[],
  platform: AdminDashboardPlatform,
): { parts: UsageMetricPart[]; done: Promise<void> } {
  const patchesByMetric = USAGE_METRIC_QUERY_ORDER.map((metric) => runMetricPipeline(metric, batches, platform));

  const stores = batches.flatMap((batch, batchIndex) => {
    if (!batch.store) return [];
    const stored = Promise.all(patchesByMetric.map((pipeline) => pipeline[batchIndex])).then(async (patches) => {
      const snapshots = new Map(batch.dayKeys.map((day) => [day, mergeSnapshot(day, patches)]));
      try {
        await persistDailyMetricSnapshots(snapshots, batch.dayKeys, platform);
      } catch (error) {
        console.error("[admin-dashboard] daily_metric_cache_store_failed", { dayKeys: batch.dayKeys, platform }, error);
        throw error;
      }
    });
    return [stored];
  });

  const parts = batches.flatMap((batch, batchIndex) => USAGE_METRIC_QUERY_ORDER.map((metric, metricIndex): UsageMetricPart => ({
    metric,
    dayKeys: [...batch.dayKeys],
    result: patchesByMetric[metricIndex][batchIndex].then(
      (patches): UsageMetricPartResult => ({ ok: true, days: toDayValues(metric, batch.dayKeys, patches) }),
      (): UsageMetricPartResult => ({ ok: false }),
    ),
  })));

  const done = Promise.allSettled([...patchesByMetric.flat(), ...stores]).then((outcomes) => {
    const failure = outcomes.find((outcome): outcome is PromiseRejectedResult => outcome.status === "rejected");
    if (failure) throw failure.reason;
  });
  // Callers that only stream the parts never await it.
  done.catch(() => undefined);
  return { parts, done };
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
    sttMsPerCharAvg: row.sttMsPerCharAvg,
    sttMsPerCharP95: row.sttMsPerCharP95,
    translationMsPerTokenAvg: row.translationMsPerTokenAvg,
    translationMsPerTokenP95: row.translationMsPerTokenP95,
  };
}

export type LoadAdminDashboardOptions = {
  forceRefresh?: boolean;
  platform?: AdminDashboardPlatform;
};

export async function clearAdminDashboardCache(
  cacheableDayKeys: readonly string[],
  platform: AdminDashboardPlatform = "all",
): Promise<void> {
  if (cacheableDayKeys.length === 0) return;
  await prisma.adminDashboardDailyMetric.deleteMany({
    where: {
      day: { in: cacheableDayKeys.map(parseDayKey) },
      platform,
    },
  });
}

function cachedUsageMetricValues(cachedByDay: ReadonlyMap<string, CachedDailyMetric>): UsageMetricValues {
  const values = emptyUsageMetricValues();
  for (const [day, row] of cachedByDay) {
    const snapshot = snapshotFromCachedRow(row);
    for (const metric of USAGE_METRIC_QUERY_ORDER) {
      values[metric][day] = USAGE_METRIC_QUERIES[metric].read(snapshot);
    }
  }
  return values;
}

export type AdminDashboardMetricsLoad = {
  /** Every metric's values on the days read back from the cache table. */
  cached: UsageMetricValues;
  /**
   * The days still to compute, already running: per batch of days (the missing cache
   * chunks in day order, then today and yesterday), one part per metric.
   */
  parts: UsageMetricPart[];
  /**
   * Settles once every part has settled and every computed chunk has been stored or has
   * failed to; rejects with the first failure. Already handled, so it can go unawaited.
   */
  done: Promise<void>;
};

/**
 * The 사용량·성능 metrics in two phases. Resolves as soon as the cache table has been read
 * (the fast phase) with those days' values, while every other day is a part that is
 * already being computed (the slow phase): missing cacheable days in chunks that are
 * stored as they finish, then today and yesterday, which are never stored.
 */
export async function startAdminDashboardMetricsLoad(
  range: AdminDashboardDateRange,
  options?: LoadAdminDashboardOptions,
): Promise<AdminDashboardMetricsLoad> {
  const platform = options?.platform ?? "all";

  // 오늘 + 어제는 데이터가 완전히 집계되지 않을 수 있으므로 항상 실시간 집계한다.
  const uncacheableKeys = resolveUncacheableDayKeys(new Date(), ADMIN_DASHBOARD_TIME_ZONE);
  const isForceRefresh = Boolean(options?.forceRefresh);

  // 캐시 조회/저장은 uncacheable 날짜(오늘+어제)를 제외한 날짜에만 수행한다.
  const cacheableDayKeysInRange = range.dayKeys.filter((dayKey) => !uncacheableKeys.has(dayKey));
  const uncacheableDaysInRange = range.dayKeys.filter((dayKey) => uncacheableKeys.has(dayKey));

  if (isForceRefresh) {
    // Cleared before recomputing: a refresh cut off part-way leaves the days it did not
    // reach missing, so the next load recomputes them instead of serving the old rows.
    await clearAdminDashboardCache(cacheableDayKeysInRange, platform);
  }
  const cachedByDay = !isForceRefresh && cacheableDayKeysInRange.length > 0
    ? await loadCachedDailyMetrics({
        ...range,
        dayKeys: cacheableDayKeysInRange,
      }, platform)
    : new Map<string, CachedDailyMetric>();

  const missingCacheableDays = cacheableDayKeysInRange.filter((dayKey) => !cachedByDay.has(dayKey));
  const { parts, done } = computeDailyMetricBatches([
    ...chunkContiguousDayKeys(missingCacheableDays, DAILY_METRIC_CACHE_CHUNK_DAYS).map((dayKeys) => ({ dayKeys, store: true })),
    ...groupContiguousDayKeys(uncacheableDaysInRange).map((dayKeys) => ({ dayKeys, store: false })),
  ], platform);

  return { cached: cachedUsageMetricValues(cachedByDay), parts, done };
}

/**
 * Every metric over the range once all of it is computed and every chunk is stored;
 * rejects with the first failure. The dashboard page streams startAdminDashboardMetricsLoad
 * instead.
 */
export async function loadAdminDashboardMetrics(
  range: AdminDashboardDateRange,
  options?: LoadAdminDashboardOptions,
): Promise<DashboardMetric[]> {
  const load = await startAdminDashboardMetricsLoad(range, options);
  await load.done;
  const results = await Promise.all(load.parts.map((part) => part.result));
  return buildUsageMetricSeries(range.dayKeys, load.cached, load.parts, results).map(toDashboardMetric);
}

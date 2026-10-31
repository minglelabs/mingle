import type { DailyPoint, DashboardMetric, MetricKind } from "@/lib/admin-dashboard-metrics";

/**
 * The 사용량·성능 tab's daily metrics, shared by the loader (admin-dashboard-query.ts) and the
 * streamed view: what each metric is, and how the days read from the cache table and the
 * days computed while the page streams merge into one series per metric.
 */
const DEFINITIONS = [
  // usage_seconds and messages lead the list -- they're the metrics that matter
  // most day-to-day, so they get the first chart slots.
  { key: "usage_seconds", label: "사용시간", unit: "초", kind: "seconds" },
  { key: "messages", label: "메시지수", unit: "건", kind: "count" },
  { key: "dau", label: "DAU", unit: "명", kind: "count" },
  { key: "signups", label: "가입자수", unit: "명", kind: "count" },
  { key: "stt_latency_ms", label: "STT 지연시간", unit: "ms", kind: "milliseconds", secondaryLabel: "p95" },
  { key: "translation_latency_ms", label: "번역 지연시간", unit: "ms", kind: "milliseconds", secondaryLabel: "p95" },
  { key: "stt_latency_ms_per_char", label: "STT 글자당 지연시간 (5자 이상)", unit: "ms", kind: "milliseconds", secondaryLabel: "p95" },
  { key: "translation_latency_ms_per_token", label: "번역 출력 토큰당 지연시간", unit: "ms", kind: "milliseconds", secondaryLabel: "p95" },
] as const satisfies ReadonlyArray<{ key: string; label: string; unit: string; kind: MetricKind; secondaryLabel?: string }>;

export type UsageMetricKey = (typeof DEFINITIONS)[number]["key"];

export type UsageMetricDefinition = {
  key: UsageMetricKey;
  label: string;
  unit: string;
  kind: MetricKind;
  /** The p95 line drawn with the average, on the latency metrics. */
  secondaryLabel?: string;
};

/** In display order: the daily charts, the cumulative charts and the table columns. */
export const USAGE_METRIC_DEFINITIONS: readonly UsageMetricDefinition[] = DEFINITIONS;

/** One metric on one day. `secondary` is the p95 of a latency metric, null for the others. */
export type UsageMetricDayValue = { value: number | null; secondary: number | null };

/** One metric's values by day key. A day that is absent has not been computed. */
export type UsageMetricDays = Record<string, UsageMetricDayValue>;

/** Every metric's values, by metric key and then day key. */
export type UsageMetricValues = Record<UsageMetricKey, UsageMetricDays>;

/** How a part settles. A failed query settles as `{ ok: false }`: a part never rejects on the server. */
export type UsageMetricPartResult = { ok: true; days: UsageMetricDays } | { ok: false };

/**
 * One metric over one run of days that was not in the cache, computed while the page
 * streams. A metric computes its parts one after another, in the order they are listed.
 */
export type UsageMetricPart = {
  metric: UsageMetricKey;
  /** Contiguous days, in day order. */
  dayKeys: string[];
  result: Promise<UsageMetricPartResult>;
};

export type UsageDayStatus = "ready" | "pending" | "failed";

export type UsageMetricSeries = {
  definition: UsageMetricDefinition;
  /** Every day of the range; null on a day that is not ready. */
  points: DailyPoint[];
  /** The p95 line of a latency metric, on the same days. */
  secondaryPoints?: DailyPoint[];
  /** Per day, in day order. */
  status: UsageDayStatus[];
  pendingDays: number;
  failedDays: number;
};

export function emptyUsageMetricValues(): UsageMetricValues {
  return Object.fromEntries(USAGE_METRIC_DEFINITIONS.map(({ key }) => [key, {}])) as UsageMetricValues;
}

const NO_VALUE: UsageMetricDayValue = { value: null, secondary: null };

/**
 * Every metric's series over `dayKeys`. A cached day is ready at once. A day of a part is
 * pending until the part settles (`results[i]` is the settled result of `parts[i]`,
 * undefined while it runs), then ready or failed. A day that is neither cached nor in a
 * part, which happens only before the cache table has been read, is pending.
 */
export function buildUsageMetricSeries(
  dayKeys: readonly string[],
  cached: Partial<UsageMetricValues>,
  parts: readonly Pick<UsageMetricPart, "metric" | "dayKeys">[],
  results: readonly (UsageMetricPartResult | undefined)[],
): UsageMetricSeries[] {
  const partDays = new Map<UsageMetricKey, Map<string, UsageMetricDayValue | "pending" | "failed">>();
  parts.forEach((part, index) => {
    const result = results[index];
    const byDay = partDays.get(part.metric) ?? new Map<string, UsageMetricDayValue | "pending" | "failed">();
    for (const day of part.dayKeys) {
      byDay.set(day, result === undefined ? "pending" : result.ok ? (result.days[day] ?? NO_VALUE) : "failed");
    }
    partDays.set(part.metric, byDay);
  });

  return USAGE_METRIC_DEFINITIONS.map((definition) => {
    const cachedDays = cached[definition.key] ?? {};
    const computedDays = partDays.get(definition.key);
    const points: DailyPoint[] = [];
    const secondaryPoints: DailyPoint[] = [];
    const status: UsageDayStatus[] = [];
    for (const day of dayKeys) {
      const entry = cachedDays[day] ?? computedDays?.get(day) ?? "pending";
      const value = typeof entry === "string" ? NO_VALUE : entry;
      status.push(typeof entry === "string" ? entry : "ready");
      points.push({ day, value: value.value });
      secondaryPoints.push({ day, value: value.secondary });
    }
    return {
      definition,
      points,
      secondaryPoints: definition.secondaryLabel ? secondaryPoints : undefined,
      status,
      pendingDays: status.filter((entry) => entry === "pending").length,
      failedDays: status.filter((entry) => entry === "failed").length,
    };
  });
}

export function toDashboardMetric(series: UsageMetricSeries): DashboardMetric {
  const { definition } = series;
  return {
    key: definition.key,
    label: definition.label,
    unit: definition.unit,
    kind: definition.kind,
    points: series.points,
    secondarySeries: definition.secondaryLabel && series.secondaryPoints
      ? { label: definition.secondaryLabel, points: series.secondaryPoints }
      : undefined,
  };
}

/**
 * Running total over the days that are ready, up to the first day that is not; null from
 * there on, since a total past a missing day is not known yet.
 */
export function buildKnownCumulativeSeries(series: UsageMetricSeries): DailyPoint[] {
  let running: number | null = 0;
  return series.points.map((point, index) => {
    if (running !== null && series.status[index] === "ready") {
      running += point.value ?? 0;
    } else {
      running = null;
    }
    return { day: point.day, value: running };
  });
}

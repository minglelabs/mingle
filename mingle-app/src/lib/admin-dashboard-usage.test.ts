import { describe, expect, it } from "vitest";
import {
  USAGE_METRIC_DEFINITIONS,
  buildKnownCumulativeSeries,
  buildUsageMetricSeries,
  toDashboardMetric,
  type UsageMetricKey,
  type UsageMetricPart,
  type UsageMetricPartResult,
} from "./admin-dashboard-usage";

const DAYS = ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29"];

function part(metric: UsageMetricKey, dayKeys: string[]): Pick<UsageMetricPart, "metric" | "dayKeys"> {
  return { metric, dayKeys };
}

type BuildArgs = Parameters<typeof buildUsageMetricSeries>;

function seriesOf(key: UsageMetricKey, cached: BuildArgs[1], parts: BuildArgs[2], results: BuildArgs[3]) {
  const series = buildUsageMetricSeries(DAYS, cached, parts, results).find((entry) => entry.definition.key === key);
  if (!series) throw new Error(`no series ${key}`);
  return series;
}

describe("buildUsageMetricSeries", () => {
  it("draws cached days at once and leaves a gap on every day still being computed", () => {
    const series = seriesOf(
      "messages",
      { messages: { [DAYS[0]]: { value: 5, secondary: null }, [DAYS[1]]: { value: 0, secondary: null } } },
      [part("messages", DAYS.slice(2))],
      [undefined],
    );

    expect(series.points.map((point) => point.value)).toEqual([5, 0, null, null]);
    expect(series.status).toEqual(["ready", "ready", "pending", "pending"]);
    expect([series.pendingDays, series.failedDays]).toEqual([2, 0]);
    expect(series.secondaryPoints).toBeUndefined();
  });

  it("fills a part's days once it settles, with the p95 of a latency metric, and marks a failed part's days", () => {
    const results: (UsageMetricPartResult | undefined)[] = [
      { ok: true, days: { [DAYS[2]]: { value: 120, secondary: 300 }, [DAYS[3]]: { value: null, secondary: null } } },
      { ok: false },
    ];
    const parts = [part("stt_latency_ms", DAYS.slice(2)), part("dau", DAYS.slice(2))];
    const cached = {
      stt_latency_ms: { [DAYS[0]]: { value: 90, secondary: 200 }, [DAYS[1]]: { value: 100, secondary: 250 } },
      dau: { [DAYS[0]]: { value: 3, secondary: null }, [DAYS[1]]: { value: 4, secondary: null } },
    };

    const latency = seriesOf("stt_latency_ms", cached, parts, results);
    expect(latency.points.map((point) => point.value)).toEqual([90, 100, 120, null]);
    expect(latency.secondaryPoints?.map((point) => point.value)).toEqual([200, 250, 300, null]);
    // A latency day without messages is ready with no value, not pending.
    expect(latency.status).toEqual(["ready", "ready", "ready", "ready"]);

    const dau = seriesOf("dau", cached, parts, results);
    expect(dau.points.map((point) => point.value)).toEqual([3, 4, null, null]);
    expect(dau.status).toEqual(["ready", "ready", "failed", "failed"]);
    expect([dau.pendingDays, dau.failedDays]).toEqual([0, 2]);
  });

  it("is all pending before the cache table has been read", () => {
    const series = buildUsageMetricSeries(DAYS, {}, [], []);

    expect(series.map((entry) => entry.definition.key)).toEqual(USAGE_METRIC_DEFINITIONS.map((definition) => definition.key));
    for (const entry of series) expect(entry.pendingDays).toBe(DAYS.length);
  });

  it("converts to the dashboard metric shape the table reads", () => {
    const metric = toDashboardMetric(seriesOf(
      "translation_latency_ms",
      { translation_latency_ms: Object.fromEntries(DAYS.map((day, index) => [day, { value: index, secondary: index * 2 }])) },
      [],
      [],
    ));

    expect(metric).toMatchObject({ key: "translation_latency_ms", label: "번역 지연시간", unit: "ms", kind: "milliseconds" });
    expect(metric.secondarySeries).toEqual({ label: "p95", points: DAYS.map((day, index) => ({ day, value: index * 2 })) });
  });
});

describe("buildKnownCumulativeSeries", () => {
  it("runs the total up to the first day that is not in yet, and leaves the rest open", () => {
    const series = seriesOf(
      "signups",
      { signups: { [DAYS[0]]: { value: 2, secondary: null }, [DAYS[1]]: { value: 3, secondary: null }, [DAYS[3]]: { value: 9, secondary: null } } },
      [part("signups", [DAYS[2]])],
      [undefined],
    );

    expect(buildKnownCumulativeSeries(series).map((point) => point.value)).toEqual([2, 5, null, null]);
  });

  it("is the full running total once every day is in", () => {
    const series = seriesOf(
      "signups",
      { signups: { [DAYS[0]]: { value: 2, secondary: null }, [DAYS[1]]: { value: 3, secondary: null } } },
      [part("signups", DAYS.slice(2))],
      [{ ok: true, days: { [DAYS[2]]: { value: 0, secondary: null }, [DAYS[3]]: { value: 4, secondary: null } } }],
    );

    expect(buildKnownCumulativeSeries(series).map((point) => point.value)).toEqual([2, 5, 5, 9]);
  });
});

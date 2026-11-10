import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import type { AdminDashboardMetricsLoad } from "@/lib/admin-dashboard-query";
import {
  USAGE_METRIC_DEFINITIONS,
  emptyUsageMetricValues,
  type UsageMetricPart,
  type UsageMetricPartResult,
  type UsageMetricValues,
} from "@/lib/admin-dashboard-usage";
import { UsageMetricsSection, UsageMetricsSectionFallback } from "./usage-metrics-section";

const DAYS = ["2026-10-29", "2026-10-30", "2026-10-31"];
/** A part that is still being computed for the whole test. */
const running = () => new Promise<UsageMetricPartResult>(() => {});

function cachedValues(days: readonly string[]): UsageMetricValues {
  const cached = emptyUsageMetricValues();
  days.forEach((day, index) => {
    for (const { key, kind } of USAGE_METRIC_DEFINITIONS) {
      cached[key][day] = kind === "milliseconds" ? { value: 100 + index, secondary: 300 + index } : { value: 1200 + index, secondary: null };
    }
  });
  return cached;
}

function load(cached: UsageMetricValues, parts: UsageMetricPart[]): Promise<AdminDashboardMetricsLoad> {
  return Promise.resolve({ cached, parts, done: new Promise<void>(() => {}) });
}

function count(html: string, text: string): number {
  return html.split(text).length - 1;
}

describe("UsageMetricsSection", () => {
  it("draws every card from the cached days at once, with a spinner where a day is still being computed", async () => {
    // Today is still running for every metric.
    const parts = USAGE_METRIC_DEFINITIONS.map(({ key }): UsageMetricPart => ({ metric: key, dayKeys: [DAYS[2]], result: running() }));

    const html = renderToStaticMarkup(await UsageMetricsSection({ loadPromise: load(cachedValues(DAYS.slice(0, 2)), parts), dayKeys: DAYS }));

    for (const { label, kind } of USAGE_METRIC_DEFINITIONS) {
      expect(html).toContain(`aria-label="${label} 일별 추이"`);
      expect(count(html, `aria-label="${label} 누적 추이"`)).toBe(kind === "milliseconds" ? 0 : 1);
    }
    // The cached values are in the table (phone cards and desktop table both)...
    expect(count(html, ">1,201<")).toBe(2 * 3);
    expect(count(html, ">101ms<")).toBe(2 * 4);
    // ...and each of today's cells, 8 metrics in both layouts, is a spinner.
    expect(count(html, '<span class="sr-only">계산 중</span>')).toBe(8 * 2);
    // Every daily and cumulative chart, and the table, says one day is still coming.
    expect(count(html, "1일 계산 중")).toBe(8 + 4 + 1);
    // A running total is shown only once every day is in.
    expect(html).not.toContain("누적 합계");
  });

  it("draws the complete cards once every day is in", async () => {
    const html = renderToStaticMarkup(await UsageMetricsSection({ loadPromise: load(cachedValues(DAYS), []), dayKeys: DAYS }));

    expect(html).not.toContain("계산 중");
    expect(html).not.toContain('role="alert"');
    expect(count(html, "누적 합계 ")).toBe(4);
    expect(html).toContain("누적 합계 3,603");
  });

  it("contains a failed cache read in the section", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const failed = Promise.reject(new Error("db down"));
    failed.catch(() => undefined);

    const html = renderToStaticMarkup(await UsageMetricsSection({ loadPromise: failed, dayKeys: DAYS }));

    expect(html).toContain('role="alert"');
    expect(html).toContain("사용량·성능 지표를 불러오지 못했습니다.");
    expect(consoleError).toHaveBeenCalledWith("[admin-dashboard] usage_metrics_failed", expect.any(Error));
    consoleError.mockRestore();
  });
});

describe("UsageMetricsSectionFallback", () => {
  it("is every card's frame while the cache table is read, and the table with its days", () => {
    const html = renderToStaticMarkup(UsageMetricsSectionFallback({ dayKeys: DAYS }));

    // Each chart frame and the table say they are loading, not which days are being computed.
    expect(count(html, "불러오는 중...")).toBe(8 + 4 + 1);
    expect(html).not.toContain("일 계산 중");
    for (const { label } of USAGE_METRIC_DEFINITIONS) expect(html).toContain(`>${label}</p>`);
    for (const day of DAYS) expect(html).toContain(`>${day}<`);
    expect(count(html, '<span class="sr-only">계산 중</span>')).toBe(DAYS.length * 8 * 2);
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const { queryRawUnsafe } = vi.hoisted(() => ({ queryRawUnsafe: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { $queryRawUnsafe: queryRawUnsafe } }));

import { startOfDayUtc } from "@/lib/admin-dashboard-metrics";
import {
  SNS_METRIC_KEYS,
  SNS_METRIC_LABELS,
  buildSnsSummary,
  type SnsMetricKey,
  type SnsMetricQueries,
} from "@/lib/admin-dashboard-sns";
import { SNS_SUMMARY_TILES, StreamedSnsChart, StreamedSnsSummaryTile, startSnsDashboardLoad } from "./sns-section";

const DAYS = ["2026-10-01", "2026-10-02"];

/** Every query still running, except the ones given. */
function queriesWith(done: Partial<Record<SnsMetricKey, Promise<Map<string, number>>>>): SnsMetricQueries {
  const queries = Object.fromEntries(SNS_METRIC_KEYS.map((key) => [key, new Promise<Map<string, number>>(() => {})]));
  return { ...queries, ...done } as SnsMetricQueries;
}

function labelOf(key: SnsMetricKey): string {
  return SNS_METRIC_LABELS.find((entry) => entry.key === key)?.label ?? key;
}

afterEach(() => {
  vi.resetAllMocks();
});

describe("SNS section", () => {
  it("shows a tile once the queries it needs are done, while the others still run", async () => {
    const tile = SNS_SUMMARY_TILES.find((entry) => entry.label === "조회 100회당 좋아요")!;
    const queries = queriesWith({
      postLikes: Promise.resolve(new Map([["2026-10-01", 30]])),
      postViews: Promise.resolve(new Map([["2026-10-01", 200], ["2026-10-02", 100]])),
    });

    const html = renderToStaticMarkup(await StreamedSnsSummaryTile({ tile, queries }));

    expect(html).toContain(">10.0<");
    expect(html).toContain("좋아요 ÷ 조회 × 100");
  });

  it("gives each tile only the totals it waits for", () => {
    const full = Object.fromEntries(SNS_METRIC_KEYS.map((key, index) => [key, (index + 1) * 7])) as Record<SnsMetricKey, number>;
    for (const tile of SNS_SUMMARY_TILES) {
      const needed = Object.fromEntries(SNS_METRIC_KEYS.map((key) => [key, tile.needs.includes(key) ? full[key] : 0])) as Record<SnsMetricKey, number>;
      const note = (summary: ReturnType<typeof buildSnsSummary>) => (typeof tile.note === "function" ? tile.note(summary) : tile.note);
      expect(tile.value(buildSnsSummary(needed)), tile.label).toBe(tile.value(buildSnsSummary(full)));
      expect(note(buildSnsSummary(needed)), tile.label).toBe(note(buildSnsSummary(full)));
    }
  });

  it("shows each chart as soon as its own query is done, and keeps a failed one in its card", async () => {
    const failure = Promise.reject(new Error("timeout"));
    failure.catch(() => undefined);
    const queries = queriesWith({ postLikes: Promise.resolve(new Map([["2026-10-02", 30]])), comments: failure });

    const likes = renderToStaticMarkup(await StreamedSnsChart({ metricKey: "postLikes", label: labelOf("postLikes"), queries, dayKeys: DAYS }));
    expect(likes).toContain('aria-label="글 좋아요 일별 추이"');
    expect(likes).toContain("기간 합계 30개");

    const comments = renderToStaticMarkup(await StreamedSnsChart({ metricKey: "comments", label: labelOf("comments"), queries, dayKeys: DAYS }));
    expect(comments).toContain('role="alert"');
    expect(comments).toContain("댓글·답글");
    expect(comments).toContain("불러오지 못했습니다.");
  });

  it("starts every query at once and logs each failure once", async () => {
    queryRawUnsafe.mockImplementation((sql: string) => (
      sql.includes('"app"."app_user_reports"') ? Promise.reject(new Error("timeout")) : Promise.resolve([])
    ));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const queries = startSnsDashboardLoad({ dayKeys: DAYS, rangeStart: startOfDayUtc(DAYS[0]), rangeEnd: startOfDayUtc("2026-10-03") });
    expect(queryRawUnsafe).toHaveBeenCalledTimes(SNS_METRIC_KEYS.length);
    await Promise.allSettled(Object.values(queries));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError.mock.calls[0].slice(0, 2)).toEqual(["[admin-dashboard] sns_metric_failed", "reports"]);
    consoleError.mockRestore();
  });
});

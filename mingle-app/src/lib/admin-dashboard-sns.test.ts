import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { buildSnsDashboard, SNS_METRIC_LABELS, type SnsMetricKey } from "./admin-dashboard-sns";
import { SnsSummaryTiles } from "@/app/admin/dashboard/sns-section";

const DAYS = ["2026-10-01", "2026-10-02", "2026-10-03"];

function byMetric(values: Partial<Record<SnsMetricKey, Record<string, number>>>) {
  return Object.fromEntries(
    SNS_METRIC_LABELS.map(({ key }) => [key, new Map(Object.entries(values[key] ?? {}))]),
  ) as Record<SnsMetricKey, Map<string, number>>;
}

describe("SNS dashboard", () => {
  it("fills missing days with zero and sums the range", () => {
    const { metrics, summary } = buildSnsDashboard(DAYS, byMetric({ postLikes: { "2026-10-01": 4, "2026-10-03": 6 } }));
    const likes = metrics.find((metric) => metric.key === "sns_postLikes");
    expect(likes?.points).toEqual([
      { day: "2026-10-01", value: 4 }, { day: "2026-10-02", value: 0 }, { day: "2026-10-03", value: 6 },
    ]);
    expect(summary.totals.postLikes).toBe(10);
    expect(metrics).toHaveLength(SNS_METRIC_LABELS.length);
  });

  it("derives the ratios, and leaves them empty without a denominator", () => {
    const { summary } = buildSnsDashboard(DAYS, byMetric({
      posts: { "2026-10-01": 3 }, operatorPosts: { "2026-10-01": 7 },
      postViews: { "2026-10-01": 200 }, postLikes: { "2026-10-01": 30 },
      comments: { "2026-10-02": 10 }, operatorPostReactions: { "2026-10-02": 20 },
    }));
    expect(summary.likesPer100Views).toBe(15);
    expect(summary.commentsPerPost).toBe(1);
    expect(summary.operatorReactionShare).toBe(0.5);

    const empty = buildSnsDashboard(DAYS, byMetric({})).summary;
    expect(empty).toMatchObject({ likesPer100Views: null, commentsPerPost: null, operatorReactionShare: null });
  });

  it("renders the summary tiles", () => {
    const { summary } = buildSnsDashboard(DAYS, byMetric({ postViews: { "2026-10-01": 1200 }, postLikes: { "2026-10-01": 60 } }));
    const html = renderToString(createElement(SnsSummaryTiles, { summary }));
    expect(html).toContain("1,200");
    expect(html).toContain("5.0");
    expect(html).toContain("운영 계정 글로 간 반응 비중");
  });
});

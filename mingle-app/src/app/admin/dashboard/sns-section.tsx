import { Suspense } from "react";
import {
  ADMIN_DASHBOARD_CHART_HEIGHT,
  ADMIN_DASHBOARD_CHART_WIDTH,
  type AdminDashboardDateRange,
  type DashboardMetric,
  buildChartGeometry,
  formatSharePercent,
} from "@/lib/admin-dashboard-metrics";
import {
  SNS_METRIC_KEYS,
  SNS_METRIC_LABELS,
  buildSnsMetric,
  buildSnsSummary,
  startSnsMetricQueries,
  type SnsMetricKey,
  type SnsMetricQueries,
  type SnsSummary,
} from "@/lib/admin-dashboard-sns";
import { LineChartCard, LineChartCardPlaceholder } from "./line-chart-card";
import { StatTile, StatTilePlaceholder } from "./stat-tile";

/** violet-600: sets the SNS charts apart from the sky usage charts above. */
const SNS_CHART_COLOR = "#7c3aed";

/**
 * Starts the live queries without awaiting them, so the page streams its header and tabs
 * while they run, and each card waits only for its own. A failure is logged here, once
 * per query; the handler also keeps one that lands before a card awaits it from
 * surfacing as an unhandled rejection.
 */
export function startSnsDashboardLoad(range: AdminDashboardDateRange): SnsMetricQueries {
  const queries = startSnsMetricQueries(range);
  for (const key of SNS_METRIC_KEYS) {
    queries[key].catch((error: unknown) => console.error("[admin-dashboard] sns_metric_failed", key, error));
  }
  return queries;
}

function formatCount(value: number): string {
  return Math.round(value).toLocaleString("ko-KR");
}

function formatRatio(value: number | null, digits = 1): string {
  return value === null ? "-" : value.toFixed(digits);
}

type SnsSummaryTileDefinition = {
  label: string;
  /** The queries the tile's number is computed from; it shows once those are done. */
  needs: readonly SnsMetricKey[];
  value: (summary: SnsSummary) => string;
  /** Fixed text, or text that comes with the number. */
  note?: string | ((summary: SnsSummary) => string);
};

export const SNS_SUMMARY_TILES: readonly SnsSummaryTileDefinition[] = [
  {
    label: "새 글",
    needs: ["posts", "operatorPosts"],
    value: (summary) => formatCount(summary.totals.posts),
    note: (summary) => `운영 계정 글 ${formatCount(summary.totals.operatorPosts)}개 별도`,
  },
  { label: "글 조회", needs: ["postViews"], value: (summary) => formatCount(summary.totals.postViews) },
  { label: "글 좋아요", needs: ["postLikes"], value: (summary) => formatCount(summary.totals.postLikes) },
  { label: "댓글·답글", needs: ["comments"], value: (summary) => formatCount(summary.totals.comments) },
  { label: "팔로우", needs: ["follows"], value: (summary) => formatCount(summary.totals.follows) },
  {
    label: "조회 100회당 좋아요",
    needs: ["postLikes", "postViews"],
    value: (summary) => formatRatio(summary.likesPer100Views),
    note: "좋아요 ÷ 조회 × 100",
  },
  {
    label: "글 1개당 댓글",
    needs: ["comments", "posts", "operatorPosts"],
    value: (summary) => formatRatio(summary.commentsPerPost, 2),
    note: "운영 계정 글 포함",
  },
  {
    label: "운영 계정 글로 간 반응 비중",
    needs: ["operatorPostReactions", "postLikes", "comments"],
    value: (summary) => (summary.operatorReactionShare === null ? "-" : formatSharePercent(summary.operatorReactionShare)),
    note: "실사용자의 좋아요+댓글 중",
  },
];

function SnsSummaryTile({ tile, summary }: { tile: SnsSummaryTileDefinition; summary: SnsSummary }) {
  const note = typeof tile.note === "function" ? tile.note(summary) : tile.note;
  return <StatTile label={tile.label} value={tile.value(summary)} note={note} />;
}

export function SnsSummaryTiles({ summary }: { summary: SnsSummary }) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {SNS_SUMMARY_TILES.map((tile) => <SnsSummaryTile key={tile.label} tile={tile} summary={summary} />)}
    </dl>
  );
}

function SnsSummaryTilePlaceholder({ tile, status }: { tile: SnsSummaryTileDefinition; status: "loading" | "error" }) {
  return (
    <StatTilePlaceholder
      label={tile.label}
      note={tile.note === undefined ? undefined : typeof tile.note === "string" ? tile.note : ""}
      status={status}
    />
  );
}

/** One tile, shown once the queries it needs are done. */
export async function StreamedSnsSummaryTile({ tile, queries }: { tile: SnsSummaryTileDefinition; queries: SnsMetricQueries }) {
  const totals = Object.fromEntries(SNS_METRIC_KEYS.map((key) => [key, 0])) as Record<SnsMetricKey, number>;
  try {
    const results = await Promise.all(tile.needs.map((key) => queries[key]));
    tile.needs.forEach((key, index) => {
      totals[key] = [...results[index].values()].reduce((sum, value) => sum + value, 0);
    });
  } catch {
    // Logged by startSnsDashboardLoad.
    return <SnsSummaryTilePlaceholder tile={tile} status="error" />;
  }
  return <SnsSummaryTile tile={tile} summary={buildSnsSummary(totals)} />;
}

function SnsChart({ metric }: { metric: DashboardMetric }) {
  const geometry = buildChartGeometry(metric.points, ADMIN_DASHBOARD_CHART_WIDTH, ADMIN_DASHBOARD_CHART_HEIGHT);
  const total = metric.points.reduce((sum, point) => sum + (point.value ?? 0), 0);
  return (
    <LineChartCard
      label={metric.label}
      kind={metric.kind}
      ariaLabel={`${metric.label} 일별 추이`}
      points={geometry.points}
      linePath={geometry.linePath}
      areaPath={geometry.areaPath}
      yMax={geometry.yMax}
      color={SNS_CHART_COLOR}
      footer={`기간 합계 ${formatCount(total)}${metric.unit}`}
    />
  );
}

/** One chart, shown as soon as its own query is done; a failure stays in its card. */
export async function StreamedSnsChart({
  metricKey,
  label,
  queries,
  dayKeys,
}: {
  metricKey: SnsMetricKey;
  label: string;
  queries: SnsMetricQueries;
  dayKeys: string[];
}) {
  let byDay: Map<string, number> | null = null;
  try {
    byDay = await queries[metricKey];
  } catch {
    // Logged by startSnsDashboardLoad.
  }
  if (!byDay) return <LineChartCardPlaceholder label={label} status="error" message="불러오지 못했습니다." />;
  return <SnsChart metric={buildSnsMetric(metricKey, dayKeys, byDay)} />;
}

/**
 * The SNS block. Every tile and chart has its own Suspense boundary and waits only for
 * the queries it needs, so nothing here waits for the slowest one. A failure is contained
 * in its card: the route has no error boundary.
 */
export function SnsSection({ queries, dayKeys }: { queries: SnsMetricQueries; dayKeys: string[] }) {
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {SNS_SUMMARY_TILES.map((tile) => (
          <Suspense key={tile.label} fallback={<SnsSummaryTilePlaceholder tile={tile} status="loading" />}>
            <StreamedSnsSummaryTile tile={tile} queries={queries} />
          </Suspense>
        ))}
      </dl>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {SNS_METRIC_LABELS.map(({ key, label }) => (
          <Suspense key={key} fallback={<SnsChartFallback label={label} />}>
            <StreamedSnsChart metricKey={key} label={label} queries={queries} dayKeys={dayKeys} />
          </Suspense>
        ))}
      </div>
    </div>
  );
}

/** A chart's Suspense fallback: its own card frame. */
export function SnsChartFallback({ label }: { label: string }) {
  return <LineChartCardPlaceholder label={label} status="loading" message="불러오는 중..." />;
}

import {
  ADMIN_DASHBOARD_CHART_HEIGHT,
  ADMIN_DASHBOARD_CHART_WIDTH,
  type AdminDashboardDateRange,
  type DashboardMetric,
  buildChartGeometry,
  formatSharePercent,
} from "@/lib/admin-dashboard-metrics";
import { loadSnsDashboard, type SnsDashboard, type SnsSummary } from "@/lib/admin-dashboard-sns";
import { LineChartCard } from "./line-chart-card";

/** violet-600: sets the SNS charts apart from the sky usage charts above. */
const SNS_CHART_COLOR = "#7c3aed";

/**
 * Starts the live queries without awaiting them, so the page runs them
 * alongside its other data. The no-op handler keeps a failure that lands
 * before the section awaits it from surfacing as an unhandled rejection.
 */
export function startSnsDashboardLoad(range: AdminDashboardDateRange): Promise<SnsDashboard> {
  const dashboard = loadSnsDashboard(range);
  dashboard.catch(() => undefined);
  return dashboard;
}

function formatCount(value: number): string {
  return Math.round(value).toLocaleString("ko-KR");
}

function formatRatio(value: number | null, digits = 1): string {
  return value === null ? "-" : value.toFixed(digits);
}

function SummaryTile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <dt className="break-words text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{value}</dd>
      {note ? <p className="mt-0.5 break-words text-xs text-slate-500">{note}</p> : null}
    </div>
  );
}

export function SnsSummaryTiles({ summary }: { summary: SnsSummary }) {
  const { totals } = summary;
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      <SummaryTile label="새 글" value={formatCount(totals.posts)} note={`운영 계정 글 ${formatCount(totals.operatorPosts)}개 별도`} />
      <SummaryTile label="글 조회" value={formatCount(totals.postViews)} />
      <SummaryTile label="글 좋아요" value={formatCount(totals.postLikes)} />
      <SummaryTile label="댓글·답글" value={formatCount(totals.comments)} />
      <SummaryTile label="팔로우" value={formatCount(totals.follows)} />
      <SummaryTile label="조회 100회당 좋아요" value={formatRatio(summary.likesPer100Views)} note="좋아요 ÷ 조회 × 100" />
      <SummaryTile label="글 1개당 댓글" value={formatRatio(summary.commentsPerPost, 2)} note="운영 계정 글 포함" />
      <SummaryTile
        label="운영 계정 글로 간 반응 비중"
        value={summary.operatorReactionShare === null ? "-" : formatSharePercent(summary.operatorReactionShare)}
        note="실사용자의 좋아요+댓글 중"
      />
    </dl>
  );
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

/**
 * The SNS block, under its own Suspense boundary so the rest of the dashboard
 * never waits for these live queries. A failure is contained here (logged and
 * shown in place): the route has no error boundary.
 */
export async function SnsSection({ dashboardPromise }: { dashboardPromise: Promise<SnsDashboard> }) {
  let dashboard: SnsDashboard | null = null;
  try {
    dashboard = await dashboardPromise;
  } catch (error) {
    console.error("[admin-dashboard] sns_metrics_failed", error);
  }
  if (!dashboard) {
    return (
      <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm font-medium text-rose-700">
        SNS 지표를 불러오지 못했습니다.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <SnsSummaryTiles summary={dashboard.summary} />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {dashboard.metrics.map((metric) => (
          <SnsChart key={metric.key} metric={metric} />
        ))}
      </div>
    </div>
  );
}

export function SnsSectionFallback() {
  return (
    <p role="status" className="rounded-xl border border-slate-200 bg-white px-3 py-6 text-center text-sm text-slate-500">
      SNS 지표를 불러오는 중...
    </p>
  );
}

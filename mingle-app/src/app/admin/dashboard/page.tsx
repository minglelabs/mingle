import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import {
  ADMIN_DASHBOARD_CHART_HEIGHT,
  ADMIN_DASHBOARD_CHART_WIDTH,
  normalizeDashboardPlatform,
  ADMIN_DASHBOARD_PRESET_OPTIONS,
  type AdminDashboardDateRange,
  type AdminDashboardPlatform,
  type AdminDashboardTab,
  type DashboardMetric,
  buildAdminDashboardHref,
  buildChartGeometry,
  buildCumulativeSeries,
  buildSharedScaleChartGeometries,
  formatMetricDisplayValue,
  normalizeDashboardDays,
  normalizeDashboardTab,
  resolveAdminDashboardRange,
} from "@/lib/admin-dashboard-metrics";
import { loadAdminDashboardMetrics } from "@/lib/admin-dashboard-query";
import { requireAdmin } from "@/server/admin/guard";
import { AdminPage, AdminPageHeader } from "../_components/ui";
import { DashboardTabNav } from "./dashboard-tab-nav";
import { LineChartCard } from "./line-chart-card";
import { MetricsTable } from "./metrics-table";
import { RangeNav } from "./range-nav";
import {
  OperatorPostStatsSection,
  OperatorPostStatsSectionFallback,
  startOperatorPostStatsLoad,
} from "./operator-post-stats-section";
import { RetentionSection, RetentionSectionFallback, startSignupRetentionLoad } from "./retention-section";
import { SnsSection, SnsSectionFallback, startSnsDashboardLoad } from "./sns-section";
import {
  TranslationModelSection,
  TranslationModelSectionFallback,
  startTranslationModelSeriesLoad,
} from "./translation-model-section";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "대시보드",
};

/** sky-600 for daily values, slate-500 (dashed) for p95, sky-700 for running totals. */
const CHART_COLOR = "#0284c7";
const SECONDARY_COLOR = "#64748b";
const CUMULATIVE_COLOR = "#0369a1";

type DashboardPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function takeFirst(value: string | string[] | undefined): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? "";
  return "";
}

function DailyChart({ metric }: { metric: DashboardMetric }) {
  // Both series share one y-scale (same unit, e.g. ms) -- computed together so
  // p95 (always >= avg) doesn't get clipped against a scale sized only for avg.
  const { geometries: [geometry, secondaryGeometry] } = buildSharedScaleChartGeometries(
    metric.secondarySeries ? [metric.points, metric.secondarySeries.points] : [metric.points],
    ADMIN_DASHBOARD_CHART_WIDTH,
    ADMIN_DASHBOARD_CHART_HEIGHT,
  );

  return (
    <LineChartCard
      label={metric.label}
      kind={metric.kind}
      ariaLabel={`${metric.label} 일별 추이`}
      points={geometry.points}
      linePath={geometry.linePath}
      areaPath={geometry.areaPath}
      yMax={geometry.yMax}
      color={CHART_COLOR}
      secondary={metric.secondarySeries && secondaryGeometry ? {
        label: metric.secondarySeries.label,
        points: secondaryGeometry.points,
        linePath: secondaryGeometry.linePath,
        areaPath: secondaryGeometry.areaPath,
        color: SECONDARY_COLOR,
      } : undefined}
    />
  );
}

function CumulativeChart({ metric }: { metric: DashboardMetric }) {
  const cumulativePoints = buildCumulativeSeries(metric.points);
  const geometry = buildChartGeometry(cumulativePoints, ADMIN_DASHBOARD_CHART_WIDTH, ADMIN_DASHBOARD_CHART_HEIGHT);
  const total = cumulativePoints[cumulativePoints.length - 1]?.value ?? null;
  const totalDisplay = formatMetricDisplayValue(total, metric.kind);

  return (
    <LineChartCard
      label={metric.label}
      kind={metric.kind}
      ariaLabel={`${metric.label} 누적 추이`}
      points={geometry.points}
      linePath={geometry.linePath}
      areaPath={geometry.areaPath}
      yMax={geometry.yMax}
      color={CUMULATIVE_COLOR}
      footer={`누적 합계 ${totalDisplay}`}
    />
  );
}

type DashboardTabInput = {
  range: AdminDashboardDateRange;
  days: number;
  platform: AdminDashboardPlatform;
  forceRefresh: boolean;
};

// The live queries below start without an await and are awaited inside their own
// Suspense boundary: the header and tab bar stream first, and a failure stays in its section.

function renderGrowthTab({ range, days }: DashboardTabInput): ReactNode {
  const signupRetention = startSignupRetentionLoad(range);
  return (
    <section className="mt-6">
      <h2 className="mb-1 text-sm font-semibold text-slate-600">가입자 · 리텐션</h2>
      <p className="mb-2 break-words text-xs text-slate-500">
        Dn 리텐션은 가입한 날로부터 n일째 되는 날 메시지·글 조회·좋아요·댓글·글쓰기·팔로우 중 하나라도 한 사람의 비율입니다. 그날이 다 지난 가입자만 셉니다. 플랫폼 필터는 적용되지 않습니다.
      </p>
      <Suspense key={`retention:${days}`} fallback={<RetentionSectionFallback />}>
        <RetentionSection dashboardPromise={signupRetention} />
      </Suspense>
    </section>
  );
}

async function renderUsageTab({ range, platform, forceRefresh }: DashboardTabInput): Promise<ReactNode> {
  const metrics = await loadAdminDashboardMetrics(range, { forceRefresh, platform });
  const cumulativeMetrics = metrics.filter((metric) => metric.kind !== "milliseconds");
  return (
    <>
      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-slate-600">일자별 추이</h2>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {metrics.map((metric) => (
            <DailyChart key={metric.key} metric={metric} />
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-2 text-sm font-semibold text-slate-600">누적 추이</h2>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {cumulativeMetrics.map((metric) => (
            <CumulativeChart key={metric.key} metric={metric} />
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-2 text-sm font-semibold text-slate-600">표로 보기</h2>
        <MetricsTable metrics={metrics} />
      </section>
    </>
  );
}

function renderModelsTab({ range, days, platform }: DashboardTabInput): ReactNode {
  const translationModelSeries = startTranslationModelSeriesLoad(range, platform);
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-sm font-semibold text-slate-600">번역 모델별 추이</h2>
      {/* Keyed by the query inputs: a days/platform change then mounts a fresh boundary that
          shows the skeleton, instead of holding the whole navigation for this data. */}
      <Suspense key={`${days}:${platform}`} fallback={<TranslationModelSectionFallback />}>
        <TranslationModelSection seriesPromise={translationModelSeries} dayKeys={range.dayKeys} />
      </Suspense>
    </section>
  );
}

function renderSnsTab({ range, days }: DashboardTabInput): ReactNode {
  const snsDashboard = startSnsDashboardLoad(range);
  return (
    <section className="mt-6">
      <h2 className="mb-1 text-sm font-semibold text-slate-600">SNS 지표</h2>
      <p className="mb-2 break-words text-xs text-slate-500">
        실사용자가 한 행동만 셉니다(운영 계정 글에 한 반응 포함). 플랫폼 필터는 적용되지 않고, 캐시 없이 매번 새로 집계합니다.
      </p>
      <Suspense key={`sns:${days}`} fallback={<SnsSectionFallback />}>
        <SnsSection dashboardPromise={snsDashboard} />
      </Suspense>
    </section>
  );
}

function renderOperatorsTab({ range, days }: DashboardTabInput): ReactNode {
  const operatorPostStats = startOperatorPostStatsLoad(range);
  return (
    <section className="mt-6">
      <h2 className="mb-1 text-sm font-semibold text-slate-600">운영 계정 글 성과</h2>
      <p className="mb-2 break-words text-xs text-slate-500">
        기간 안에 올라간 운영 계정 글입니다. 실사용자만 세고(운영·공식·직원 계정과 글쓴이 제외), %는 조회 대비입니다. 팔로우·첫 메시지는 그 글에서 했거나, 하기 전 24시간 안에 마지막으로 본 그 계정 글로 셉니다. 플랫폼 필터는 적용되지 않습니다.
      </p>
      <Suspense key={`operator-posts:${days}`} fallback={<OperatorPostStatsSectionFallback />}>
        <OperatorPostStatsSection dashboardPromise={operatorPostStats} />
      </Suspense>
    </section>
  );
}

/** Keyed by tab, so a new tab without its renderer is a type error. Only the active tab's
 * renderer runs, so a request starts only that tab's queries. */
const DASHBOARD_TAB_RENDERERS: Record<AdminDashboardTab, (input: DashboardTabInput) => ReactNode | Promise<ReactNode>> = {
  growth: renderGrowthTab,
  usage: renderUsageTab,
  models: renderModelsTab,
  sns: renderSnsTab,
  operators: renderOperatorsTab,
};

export default async function AdminDashboardPage({ searchParams }: DashboardPageProps) {
  const params = await searchParams;
  const tab = normalizeDashboardTab(takeFirst(params.tab));
  const days = normalizeDashboardDays(takeFirst(params.days));
  const platform = normalizeDashboardPlatform(takeFirst(params.platform));
  await requireAdmin(buildAdminDashboardHref({ tab, days, platform }));

  const forceRefresh = takeFirst(params.refresh) === "true" || takeFirst(params.refresh) === "1";
  const range = resolveAdminDashboardRange(new Date(), days);
  const tabContent = await DASHBOARD_TAB_RENDERERS[tab]({ range, days, platform, forceRefresh });

  return (
    <AdminPage wide>
      <AdminPageHeader
        back={{ href: "/admin/more", label: "더보기" }}
        description="날짜는 UTC 기준입니다. 운영 계정의 활동은 지표에 넣지 않습니다."
        title="대시보드"
      />

      <DashboardTabNav activeTab={tab} days={days} platform={platform} />

      <RangeNav
        presetOptions={ADMIN_DASHBOARD_PRESET_OPTIONS}
        activeTab={tab}
        activeDays={days}
        activePlatform={platform}
      />

      {tabContent}
    </AdminPage>
  );
}

import type { Metadata } from "next";
import { Suspense } from "react";
import {
  ADMIN_DASHBOARD_CHART_HEIGHT,
  ADMIN_DASHBOARD_CHART_WIDTH,
  normalizeDashboardPlatform,
  ADMIN_DASHBOARD_PRESET_OPTIONS,
  type AdminDashboardPlatform,
  type DashboardMetric,
  buildChartGeometry,
  buildCumulativeSeries,
  buildSharedScaleChartGeometries,
  formatMetricDisplayValue,
  normalizeDashboardDays,
  resolveAdminDashboardRange,
} from "@/lib/admin-dashboard-metrics";
import { loadAdminDashboardMetrics } from "@/lib/admin-dashboard-query";
import { requireAdmin } from "@/server/admin/guard";
import { AdminPage, AdminPageHeader } from "../_components/ui";
import { LineChartCard } from "./line-chart-card";
import { MetricsTable } from "./metrics-table";
import { RangeNav } from "./range-nav";
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

function dashboardPath(days: number, platform: AdminDashboardPlatform): string {
  const params = new URLSearchParams({ days: String(days) });
  if (platform !== "all") params.set("platform", platform);
  return `/admin/dashboard?${params.toString()}`;
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

export default async function AdminDashboardPage({ searchParams }: DashboardPageProps) {
  const params = await searchParams;
  const days = normalizeDashboardDays(takeFirst(params.days));
  const platform = normalizeDashboardPlatform(takeFirst(params.platform));
  await requireAdmin(dashboardPath(days, platform));

  const forceRefresh = takeFirst(params.refresh) === "true" || takeFirst(params.refresh) === "1";
  const range = resolveAdminDashboardRange(new Date(), days);
  // Started before the metrics await so both queries run at once, but awaited only inside
  // TranslationModelSection: this live query must neither hold back nor, if it fails,
  // take down the rest of the page.
  const translationModelSeries = startTranslationModelSeriesLoad(range, platform);
  const snsDashboard = startSnsDashboardLoad(range);
  const metrics = await loadAdminDashboardMetrics(range, { forceRefresh, platform });
  const cumulativeMetrics = metrics.filter((metric) => metric.kind !== "milliseconds");

  return (
    <AdminPage wide>
      <AdminPageHeader
        back={{ href: "/admin/more", label: "더보기" }}
        description="날짜는 UTC 기준입니다. 운영 계정의 활동은 지표에 넣지 않습니다."
        title="대시보드"
      />

      <RangeNav
        presetOptions={ADMIN_DASHBOARD_PRESET_OPTIONS}
        activeDays={days}
        activePlatform={platform}
      />

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-slate-600">일자별 추이</h2>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {metrics.map((metric) => (
            <DailyChart key={metric.key} metric={metric} />
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-1 text-sm font-semibold text-slate-600">SNS 지표</h2>
        <p className="mb-2 break-words text-xs text-slate-500">
          실사용자가 한 행동만 셉니다(운영 계정 글에 한 반응 포함). 플랫폼 필터는 적용되지 않고, 캐시 없이 매번 새로 집계합니다.
        </p>
        <Suspense key={`sns:${days}`} fallback={<SnsSectionFallback />}>
          <SnsSection dashboardPromise={snsDashboard} />
        </Suspense>
      </section>

      <section className="mt-8">
        <h2 className="mb-2 text-sm font-semibold text-slate-600">번역 모델별 추이</h2>
        {/* Keyed by the query inputs: a days/platform change then mounts a fresh boundary that
            shows the skeleton, instead of holding the whole navigation for this data. */}
        <Suspense key={`${days}:${platform}`} fallback={<TranslationModelSectionFallback />}>
          <TranslationModelSection seriesPromise={translationModelSeries} dayKeys={range.dayKeys} />
        </Suspense>
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
    </AdminPage>
  );
}

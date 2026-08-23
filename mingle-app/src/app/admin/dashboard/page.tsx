import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ADMIN_SESSION_COOKIE_NAME, verifyAdminSessionToken } from "@/lib/admin-auth";
import {
  ADMIN_DASHBOARD_CHART_HEIGHT,
  ADMIN_DASHBOARD_CHART_WIDTH,
  ADMIN_DASHBOARD_PRESET_OPTIONS,
  type DashboardMetric,
  buildChartGeometry,
  buildCumulativeSeries,
  formatMetricDisplayValue,
  normalizeDashboardDays,
  resolveAdminDashboardRange,
} from "@/lib/admin-dashboard-metrics";
import { loadAdminDashboardMetrics } from "@/lib/admin-dashboard-query";
import { LineChartCard } from "./line-chart-card";
import { MetricsTable } from "./metrics-table";
import { RangeNav } from "./range-nav";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mingle Admin Dashboard",
};

const CHART_COLOR = "#2a78d6";
const SECONDARY_COLOR = "#eb6834";
const CUMULATIVE_COLOR = "#1baf7a";

type DashboardPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function takeFirst(value: string | string[] | undefined): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? "";
  return "";
}

async function isAdminAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  return verifyAdminSessionToken(cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value);
}

function DailyChart({ metric }: { metric: DashboardMetric }) {
  // Both series share one y-scale (same unit, e.g. ms) -- computed together so
  // p95 (always >= avg) doesn't get clipped against a scale sized only for avg.
  const combinedForScale = metric.secondarySeries
    ? [...metric.points, ...metric.secondarySeries.points]
    : metric.points;
  const scaleGeometry = buildChartGeometry(combinedForScale, ADMIN_DASHBOARD_CHART_WIDTH, ADMIN_DASHBOARD_CHART_HEIGHT);
  const geometry = buildChartGeometry(metric.points, ADMIN_DASHBOARD_CHART_WIDTH, ADMIN_DASHBOARD_CHART_HEIGHT, scaleGeometry.yMax);
  const secondaryGeometry = metric.secondarySeries
    ? buildChartGeometry(metric.secondarySeries.points, ADMIN_DASHBOARD_CHART_WIDTH, ADMIN_DASHBOARD_CHART_HEIGHT, scaleGeometry.yMax)
    : null;

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
  if (!(await isAdminAuthenticated())) {
    redirect("/admin");
  }

  const params = await searchParams;
  const days = normalizeDashboardDays(takeFirst(params.days));
  const forceRefresh = takeFirst(params.refresh) === "true" || takeFirst(params.refresh) === "1";
  const range = resolveAdminDashboardRange(new Date(), days);
  const metrics = await loadAdminDashboardMetrics(range, { forceRefresh });
  const cumulativeMetrics = metrics.filter((metric) => metric.kind !== "milliseconds");

  return (
    <main className="h-svh w-full overflow-y-auto bg-[#f9f9f7] text-[#0b0b0b]">
      <header className="border-b border-[#e5e3dc] bg-white">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-5">
          <h1 className="text-2xl font-semibold text-[#0b0b0b]">서비스 대시보드</h1>
          <Link
            className="inline-flex h-10 items-center justify-center rounded-md border border-[#e5e3dc] bg-white px-4 text-sm font-semibold text-[#52514e] transition hover:bg-[#f4f3ee]"
            href="/admin"
          >
            피드백함으로
          </Link>
          <Link
            className="inline-flex h-10 items-center justify-center rounded-md border border-[#e5e3dc] bg-white px-4 text-sm font-semibold text-[#52514e] transition hover:bg-[#f4f3ee]"
            href="/admin/conversations"
          >
            대화록 조회
          </Link>
        </div>
      </header>

      <RangeNav presetOptions={ADMIN_DASHBOARD_PRESET_OPTIONS} activeDays={days} />

      <section className="mx-auto mt-6 w-full max-w-6xl px-4">
        <h2 className="mb-2 text-sm font-semibold text-[#52514e]">일자별 추이</h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {metrics.map((metric) => (
            <DailyChart key={metric.key} metric={metric} />
          ))}
        </div>
      </section>

      <section className="mx-auto mt-8 w-full max-w-6xl px-4">
        <h2 className="mb-2 text-sm font-semibold text-[#52514e]">누적 추이</h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {cumulativeMetrics.map((metric) => (
            <CumulativeChart key={metric.key} metric={metric} />
          ))}
        </div>
      </section>

      <section className="mx-auto mt-8 mb-6 w-full max-w-6xl px-4 pb-6">
        <h2 className="mb-2 text-sm font-semibold text-[#52514e]">표로 보기</h2>
        <MetricsTable metrics={metrics} />
      </section>
    </main>
  );
}

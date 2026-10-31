"use client";

import { useMemo, type ReactNode } from "react";
import {
  ADMIN_DASHBOARD_CHART_HEIGHT,
  ADMIN_DASHBOARD_CHART_WIDTH,
  buildChartGeometry,
  buildSharedScaleChartGeometries,
  formatMetricDisplayValue,
} from "@/lib/admin-dashboard-metrics";
import {
  USAGE_METRIC_DEFINITIONS,
  buildKnownCumulativeSeries,
  buildUsageMetricSeries,
  toDashboardMetric,
  type UsageMetricPart,
  type UsageMetricSeries,
  type UsageMetricValues,
} from "@/lib/admin-dashboard-usage";
import { LineChartCard, LineChartCardPlaceholder } from "./line-chart-card";
import { MetricsTable } from "./metrics-table";
import { usePartResults } from "./part-results-store";

/** sky-600 for daily values, slate-500 (dashed) for p95, sky-700 for running totals. */
const CHART_COLOR = "#0284c7";
const SECONDARY_COLOR = "#64748b";
const CUMULATIVE_COLOR = "#0369a1";

const LOADING_MESSAGE = "불러오는 중...";

/** Latency averages have no meaningful running total. */
function hasCumulativeChart(kind: UsageMetricSeries["definition"]["kind"]): boolean {
  return kind !== "milliseconds";
}

function loadStateOf(series: UsageMetricSeries) {
  return { pendingDays: series.pendingDays, failedDays: series.failedDays };
}

function DailyChart({ series }: { series: UsageMetricSeries }) {
  const { definition, secondaryPoints } = series;
  // Both series share one y-scale (same unit, e.g. ms) -- computed together so
  // p95 (always >= avg) doesn't get clipped against a scale sized only for avg.
  const { geometries: [geometry, secondaryGeometry] } = buildSharedScaleChartGeometries(
    secondaryPoints ? [series.points, secondaryPoints] : [series.points],
    ADMIN_DASHBOARD_CHART_WIDTH,
    ADMIN_DASHBOARD_CHART_HEIGHT,
  );

  return (
    <LineChartCard
      label={definition.label}
      kind={definition.kind}
      ariaLabel={`${definition.label} 일별 추이`}
      points={geometry.points}
      linePath={geometry.linePath}
      areaPath={geometry.areaPath}
      yMax={geometry.yMax}
      color={CHART_COLOR}
      secondary={definition.secondaryLabel && secondaryGeometry ? {
        label: definition.secondaryLabel,
        points: secondaryGeometry.points,
        linePath: secondaryGeometry.linePath,
        areaPath: secondaryGeometry.areaPath,
        color: SECONDARY_COLOR,
      } : undefined}
      loadState={loadStateOf(series)}
    />
  );
}

function CumulativeChart({ series }: { series: UsageMetricSeries }) {
  const { definition } = series;
  const cumulativePoints = buildKnownCumulativeSeries(series);
  const geometry = buildChartGeometry(cumulativePoints, ADMIN_DASHBOARD_CHART_WIDTH, ADMIN_DASHBOARD_CHART_HEIGHT);
  const complete = series.pendingDays === 0 && series.failedDays === 0;
  const total = cumulativePoints[cumulativePoints.length - 1]?.value ?? null;

  return (
    <LineChartCard
      label={definition.label}
      kind={definition.kind}
      ariaLabel={`${definition.label} 누적 추이`}
      points={geometry.points}
      linePath={geometry.linePath}
      areaPath={geometry.areaPath}
      yMax={geometry.yMax}
      color={CUMULATIVE_COLOR}
      // The total is shown only once every day is in.
      footer={complete ? `누적 합계 ${formatMetricDisplayValue(total, definition.kind)}` : undefined}
      loadState={loadStateOf(series)}
    />
  );
}

function UsageMetricsSections({
  dailyCharts,
  cumulativeCharts,
  table,
}: {
  dailyCharts: ReactNode;
  cumulativeCharts: ReactNode;
  table: ReactNode;
}) {
  return (
    <>
      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-slate-600">일자별 추이</h2>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">{dailyCharts}</div>
      </section>

      <section className="mt-8">
        <h2 className="mb-2 text-sm font-semibold text-slate-600">누적 추이</h2>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">{cumulativeCharts}</div>
      </section>

      <section className="mt-8">
        <h2 className="mb-2 text-sm font-semibold text-slate-600">표로 보기</h2>
        {table}
      </section>
    </>
  );
}

function SeriesTable({ series, pendingText }: { series: UsageMetricSeries[]; pendingText?: string }) {
  const metrics = useMemo(() => series.map(toDashboardMetric), [series]);
  const dayStatus = useMemo(
    () => Object.fromEntries(series.map((entry) => [entry.definition.key, entry.status])),
    [series],
  );
  return <MetricsTable metrics={metrics} dayStatus={dayStatus} pendingText={pendingText} />;
}

/**
 * The 사용량·성능 tab once the cache table has been read: every card is drawn from the
 * cached days at once, and each day still being computed fills in as its part arrives
 * (a gap and a spinner until then). Every card reads the same parts, subscribed to once.
 */
export function UsageMetricsView({
  dayKeys,
  cached,
  parts,
}: {
  dayKeys: string[];
  cached: UsageMetricValues;
  parts: UsageMetricPart[];
}) {
  const results = usePartResults(parts);
  const series = useMemo(
    () => buildUsageMetricSeries(dayKeys, cached, parts, results),
    [dayKeys, cached, parts, results],
  );

  return (
    <UsageMetricsSections
      dailyCharts={series.map((entry) => <DailyChart key={entry.definition.key} series={entry} />)}
      cumulativeCharts={series
        .filter((entry) => hasCumulativeChart(entry.definition.kind))
        .map((entry) => <CumulativeChart key={entry.definition.key} series={entry} />)}
      table={<SeriesTable series={series} />}
    />
  );
}

/** While the cache table is read: every card's frame, and the table with its days. */
export function UsageMetricsFallbackView({ dayKeys }: { dayKeys: string[] }) {
  const series = buildUsageMetricSeries(dayKeys, {}, [], []);
  return (
    <UsageMetricsSections
      dailyCharts={USAGE_METRIC_DEFINITIONS.map((definition) => (
        <LineChartCardPlaceholder key={definition.key} label={definition.label} status="loading" message={LOADING_MESSAGE} />
      ))}
      cumulativeCharts={USAGE_METRIC_DEFINITIONS
        .filter((definition) => hasCumulativeChart(definition.kind))
        .map((definition) => (
          <LineChartCardPlaceholder key={definition.key} label={definition.label} status="loading" message={LOADING_MESSAGE} />
        ))}
      table={<SeriesTable series={series} pendingText={LOADING_MESSAGE} />}
    />
  );
}

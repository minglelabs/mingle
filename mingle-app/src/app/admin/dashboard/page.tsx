import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ADMIN_SESSION_COOKIE_NAME, verifyAdminSessionToken } from "@/lib/admin-auth";
import {
  ADMIN_DASHBOARD_RANGE_OPTIONS,
  DEPLOY_MARKERS,
  type DashboardMetric,
  buildChartGeometry,
  formatDeltaPercent,
  formatMetricValue,
  formatSecondsAsDuration,
  formatShortDay,
  normalizeDashboardDays,
  resolveDeltaTone,
  resolveDeployMarkerX,
  resolveXAxisTicks,
  computeDeltaPercent,
} from "@/lib/admin-dashboard-metrics";
import { loadAdminDashboardMetrics } from "@/lib/admin-dashboard-query";
import { RangeNav } from "./range-nav";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mingle Admin Dashboard",
};

const CHART_COLOR = "#2a78d6";
const SECONDARY_COLOR = "#eb6834";
const GOOD_COLOR = "#006300";
const BAD_COLOR = "#d03b3b";
const MARKER_COLOR = "#898781";
const CHART_WIDTH = 560;
const CHART_HEIGHT = 140;

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

function DeltaBadge({
  latest,
  comparison,
  lowerIsBetter,
}: {
  latest: number | null;
  comparison: { label: string; value: number | null };
  lowerIsBetter: boolean;
}) {
  const deltaPercent = computeDeltaPercent(latest, comparison.value);
  const tone = resolveDeltaTone(deltaPercent, lowerIsBetter);
  const glyph = deltaPercent === null || Math.abs(deltaPercent) < 0.05 ? "→" : deltaPercent > 0 ? "▲" : "▼";
  const color = tone === "good" ? GOOD_COLOR : tone === "bad" ? BAD_COLOR : "#52514e";
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color }}>
      <span aria-hidden="true">{glyph}</span>
      {formatDeltaPercent(deltaPercent)}
      <span className="font-normal text-slate-400">{comparison.label}</span>
    </span>
  );
}

function StatTile({ metric }: { metric: DashboardMetric }) {
  const displayValue = metric.kind === "seconds" && metric.latest !== null
    ? formatSecondsAsDuration(metric.latest)
    : formatMetricValue(metric.latest, metric.kind);
  const summaryDisplay = metric.kind === "seconds" && metric.summaryValue !== null
    ? formatSecondsAsDuration(metric.summaryValue)
    : formatMetricValue(metric.summaryValue, metric.kind);

  return (
    <div className="rounded-lg border border-slate-300 bg-white p-2.5 shadow-sm">
      <p className="text-sm font-medium text-slate-600">{metric.label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-950">{displayValue}</p>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
        {metric.comparisons.map((comparison) => (
          <DeltaBadge
            key={comparison.label}
            comparison={comparison}
            latest={metric.latest}
            lowerIsBetter={metric.lowerIsBetter}
          />
        ))}
      </div>
      <p className="mt-1.5 border-t border-slate-200 pt-1.5 text-xs text-slate-600">
        {metric.summaryLabel}: <span className="font-semibold text-slate-800">{summaryDisplay}</span>
      </p>
    </div>
  );
}

function MetricChart({ metric }: { metric: DashboardMetric }) {
  // Both series share one y-scale (same unit, e.g. ms) -- computed together so
  // p95 (always >= avg) doesn't get clipped against a scale sized only for avg.
  const combinedForScale = metric.secondarySeries
    ? [...metric.points, ...metric.secondarySeries.points]
    : metric.points;
  const scaleGeometry = buildChartGeometry(combinedForScale, CHART_WIDTH, CHART_HEIGHT);
  const geometry = buildChartGeometry(metric.points, CHART_WIDTH, CHART_HEIGHT, scaleGeometry.yMax);
  const secondaryGeometry = metric.secondarySeries
    ? buildChartGeometry(metric.secondarySeries.points, CHART_WIDTH, CHART_HEIGHT, scaleGeometry.yMax)
    : null;
  const lastPoint = geometry.points[geometry.points.length - 1];
  const midValue = geometry.yMax / 2;
  const dayKeys = metric.points.map((point) => point.day);
  const lastDay = dayKeys[dayKeys.length - 1] ?? "";
  const xAxisTicks = resolveXAxisTicks(dayKeys, CHART_WIDTH, 6);
  const visibleMarkers = DEPLOY_MARKERS
    .map((marker) => ({ marker, x: resolveDeployMarkerX(dayKeys, marker.date, CHART_WIDTH) }))
    .filter((entry): entry is { marker: typeof DEPLOY_MARKERS[number]; x: number } => entry.x !== null);

  return (
    <div className="rounded-lg border border-slate-300 bg-white p-2.5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-900">{metric.label}</p>
        {metric.secondarySeries ? (
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1">
              <span aria-hidden="true" className="inline-block h-0.5 w-3" style={{ backgroundColor: CHART_COLOR }} />
              평균
            </span>
            <span className="inline-flex items-center gap-1">
              <span aria-hidden="true" className="inline-block h-0.5 w-3" style={{ backgroundColor: SECONDARY_COLOR }} />
              {metric.secondarySeries.label}
            </span>
          </div>
        ) : null}
      </div>
      <svg
        className="mt-1.5 w-full"
        role="img"
        aria-label={`${metric.label} 일별 추이`}
        viewBox={`-4 -8 ${CHART_WIDTH + 48} ${CHART_HEIGHT + 30}`}
      >
        {/* gridlines: 0 / mid / max, hairline recessive */}
        {[0, midValue, geometry.yMax].map((tickValue) => {
          const y = CHART_HEIGHT - (tickValue / (geometry.yMax || 1)) * CHART_HEIGHT;
          return (
            <g key={tickValue}>
              <line x1={0} x2={CHART_WIDTH} y1={y} y2={y} stroke="#e1e0d9" strokeWidth={1} />
              <text x={CHART_WIDTH + 6} y={y + 3} fontSize={10} fill="#898781">
                {Math.round(tickValue).toLocaleString("en-US")}
              </text>
            </g>
          );
        })}

        {/* deploy markers: dashed reference lines, distinct from the solid data gridlines above */}
        {visibleMarkers.map(({ marker, x }) => (
          <g key={marker.date}>
            <line x1={x} x2={x} y1={0} y2={CHART_HEIGHT} stroke={MARKER_COLOR} strokeWidth={1} strokeDasharray="3,3">
              <title>{`${marker.date}: ${marker.label}`}</title>
            </line>
          </g>
        ))}

        {secondaryGeometry?.areaPath ? (
          <path d={secondaryGeometry.areaPath} fill={SECONDARY_COLOR} opacity={0.08} />
        ) : null}
        {secondaryGeometry?.linePath ? (
          <path d={secondaryGeometry.linePath} fill="none" stroke={SECONDARY_COLOR} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        ) : null}
        {secondaryGeometry?.points.map((point) => (
          point.value === null ? null : (
            <circle key={`p95-${point.day}`} cx={point.x} cy={point.y} r={2.5} fill={SECONDARY_COLOR} stroke="#ffffff" strokeWidth={2}>
              <title>{`${point.day} ${metric.secondarySeries?.label}: ${formatMetricValue(point.value, metric.kind)}`}</title>
            </circle>
          )
        ))}

        {geometry.areaPath ? (
          <path d={geometry.areaPath} fill={CHART_COLOR} opacity={0.1} />
        ) : null}
        {geometry.linePath ? (
          <path d={geometry.linePath} fill="none" stroke={CHART_COLOR} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        ) : null}

        {geometry.points.map((point) => (
          point.value === null ? null : (
            <circle key={point.day} cx={point.x} cy={point.y} r={point.value === lastPoint?.value && point.day === lastDay ? 4 : 2.5} fill={CHART_COLOR} stroke="#ffffff" strokeWidth={2}>
              <title>{`${point.day}: ${formatMetricValue(point.value, metric.kind)}`}</title>
            </circle>
          )
        ))}

        {lastPoint && lastPoint.value !== null ? (
          <text x={lastPoint.x} y={Math.max(10, lastPoint.y - 8)} fontSize={11} fontWeight={600} fill="#0b0b0b" textAnchor="end">
            {formatMetricValue(lastPoint.value, metric.kind)}
          </text>
        ) : null}

        {/* x-axis date ticks, so a value is readable at a glance without hovering */}
        {xAxisTicks.map((tick) => (
          <text
            key={tick.day}
            x={tick.x}
            y={CHART_HEIGHT + 20}
            fontSize={10}
            fill="#898781"
            textAnchor={tick.day === dayKeys[0] ? "start" : tick.day === lastDay ? "end" : "middle"}
          >
            {formatShortDay(tick.day)}
          </text>
        ))}
      </svg>
    </div>
  );
}

function MetricsTable({ metrics }: { metrics: DashboardMetric[] }) {
  const dayKeys = metrics[0]?.points.map((point) => point.day) ?? [];
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-300 bg-white shadow-sm">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-slate-300 bg-slate-50 text-xs font-semibold uppercase text-slate-600">
            <th className="px-3 py-2">날짜</th>
            {metrics.map((metric) => (
              <th className="px-3 py-2" key={metric.key}>{metric.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dayKeys.map((day, rowIndex) => {
            const marker = DEPLOY_MARKERS.find((entry) => entry.date === day);
            return (
            <tr className={marker ? "border-b border-slate-200 bg-amber-50 last:border-0" : "border-b border-slate-200 last:border-0"} key={day}>
              <td className="px-3 py-1.5 font-medium text-slate-800" style={{ fontVariantNumeric: "tabular-nums" }}>
                <span className="flex items-center gap-1.5">
                  {day}
                  {marker ? (
                    <span
                      className="inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800"
                      title={marker.label}
                    >
                      <span aria-hidden="true">🚀</span>
                      {marker.label}
                    </span>
                  ) : null}
                </span>
              </td>
              {metrics.map((metric) => {
                const value = metric.points[rowIndex]?.value ?? null;
                const display = metric.kind === "seconds" && value !== null
                  ? formatSecondsAsDuration(value)
                  : formatMetricValue(value, metric.kind);
                return (
                  <td className="px-3 py-1.5 text-slate-700" key={metric.key} style={{ fontVariantNumeric: "tabular-nums" }}>
                    {display}
                  </td>
                );
              })}
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default async function AdminDashboardPage({ searchParams }: DashboardPageProps) {
  if (!(await isAdminAuthenticated())) {
    redirect("/admin");
  }

  const params = await searchParams;
  const days = normalizeDashboardDays(takeFirst(params.days));
  const metrics = await loadAdminDashboardMetrics({ now: new Date(), days });

  return (
    <main className="h-svh w-full overflow-y-auto bg-[#f8fafc] text-slate-950">
      <header className="border-b border-slate-300 bg-white">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-950">서비스 대시보드</h1>
            <p className="mt-1 text-sm text-slate-500">가입자수 · DAU · 메시지수 · 사용시간 · STT/번역 지연시간 (UTC 기준)</p>
            {DEPLOY_MARKERS.length > 0 ? (
              <p className="mt-1 text-xs text-slate-400">
                배포 마커: {DEPLOY_MARKERS.map((marker) => `${marker.date} ${marker.label}`).join(" · ")}
              </p>
            ) : null}
          </div>
          <Link
            className="inline-flex h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            href="/admin"
          >
            피드백함으로
          </Link>
        </div>
      </header>

      <RangeNav options={ADMIN_DASHBOARD_RANGE_OPTIONS} activeDays={days} />

      <section className="mx-auto mt-3 grid w-full max-w-6xl grid-cols-1 gap-2 px-4 sm:grid-cols-2 lg:grid-cols-3">
        {metrics.map((metric) => (
          <StatTile key={metric.key} metric={metric} />
        ))}
      </section>

      <section className="mx-auto mt-3 grid w-full max-w-6xl grid-cols-1 gap-3 px-4 lg:grid-cols-2">
        {metrics.map((metric) => (
          <MetricChart key={metric.key} metric={metric} />
        ))}
      </section>

      <section className="mx-auto mt-3 mb-4 w-full max-w-6xl px-4 pb-6">
        <h2 className="mb-1.5 text-sm font-semibold text-slate-700">표로 보기</h2>
        <MetricsTable metrics={metrics} />
      </section>
    </main>
  );
}

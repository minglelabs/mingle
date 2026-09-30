"use client";

import { useMemo } from "react";
import {
  ADMIN_DASHBOARD_CHART_HEIGHT,
  ADMIN_DASHBOARD_WIDE_CHART_WIDTH,
  type ChartPoint,
  type MetricKind,
  formatMetricDisplayValue,
  formatSharePercent,
  resolveChartFrame,
} from "@/lib/admin-dashboard-metrics";
import {
  ChartCard,
  ChartDot,
  ChartHoverGuide,
  ChartHoverMarker,
  ChartHoverTarget,
  ChartLegendItem,
  ChartLine,
  ChartSvg,
  ChartTooltip,
  ChartXAxisLabels,
  ChartYGrid,
  snapToNearest,
  useChartHover,
} from "./line-chart-card";

const FRAME = resolveChartFrame(ADMIN_DASHBOARD_WIDE_CHART_WIDTH, ADMIN_DASHBOARD_CHART_HEIGHT);
// The plot is about twice as wide as a half-width card's, so it gets twice its 6 ticks.
const X_AXIS_MAX_TICKS = 12;
/** Past this many days the per-day dots of every series crowd into a solid band, so only
 * the lines are drawn; the hover markers still pin the hovered day's values. */
export const MULTI_LINE_CHART_MAX_DOTTED_DAYS = 45;
const HEADER_CLASS_NAME = "flex flex-wrap items-center justify-between gap-x-4 gap-y-1";

export type MultiLineChartSeries = {
  key: string;
  label: string;
  color: string;
  /** Projected with ADMIN_DASHBOARD_WIDE_CHART_WIDTH on the same y-scale as every other series. */
  points: ChartPoint[];
  linePath: string;
  /** Range total and its 0..1 share of all series, shown in the legend. */
  total: number;
  share: number;
};

/**
 * Every series' snapped point on the hovered day, for the tooltip rows and markers. The
 * anchor sits above the highest marker so the tooltip never covers a hovered value.
 */
export function resolveHoveredDay<T extends { points: readonly ChartPoint[] }>(series: readonly T[], hoverIndex: number) {
  const rows = series.flatMap((entry) => {
    const point = snapToNearest(entry.points, hoverIndex);
    return point ? [{ entry, point }] : [];
  });
  const anchor = rows[0]?.point;
  if (!anchor) return null;
  return { day: anchor.day, x: anchor.x, y: Math.min(...rows.map(({ point }) => point.y)), rows };
}

/**
 * Full-width card for several peer series on one shared y-scale (e.g. messages per
 * translation model). Same card, grid, axes, dots and snapping hover as LineChartCard;
 * the tooltip lists every series' value for the hovered day, and the legend shows each
 * series' range total and share. Every series must be filled over the same dayKeys.
 */
export function MultiLineChartCard(props: {
  label: string;
  kind: MetricKind;
  ariaLabel: string;
  dayKeys: string[];
  series: MultiLineChartSeries[];
  yMax: number;
  /** Shown in place of the legend when there is no series to draw. */
  emptyMessage: string;
}) {
  const { label, kind, ariaLabel, dayKeys, series, yMax, emptyMessage } = props;
  // With no series there is nothing to hover, so hover is simply never armed.
  const { hoverIndex, handlePointerMove, handlePointerLeave } = useChartHover(FRAME, series[0]?.points.length ?? 0);
  const showDots = dayKeys.length <= MULTI_LINE_CHART_MAX_DOTTED_DAYS;

  // The layers below depend on the data alone. Built once per data change and reused as
  // the same elements, so a hover move re-renders only the guide, markers and tooltip.
  const legend = useMemo(() => (series.length > 0 ? (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#898781]">
      {series.map((entry) => (
        <ChartLegendItem key={entry.key} color={entry.color}>
          {entry.label}
          <span className="font-semibold text-[#52514e]" style={{ fontVariantNumeric: "tabular-nums" }}>
            {formatMetricDisplayValue(entry.total, kind)}
          </span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>({formatSharePercent(entry.share)})</span>
        </ChartLegendItem>
      ))}
    </div>
  ) : (
    <p className="text-xs font-medium text-[#898781]">{emptyMessage}</p>
  )), [series, kind, emptyMessage]);

  const axes = useMemo(() => (
    <>
      <ChartYGrid frame={FRAME} yMax={yMax} />
      <ChartXAxisLabels frame={FRAME} dayKeys={dayKeys} maxTicks={X_AXIS_MAX_TICKS} />
    </>
  ), [yMax, dayKeys]);

  // Paint the last series first so the first legend entry ends up on top ("기타" at the bottom).
  const lines = useMemo(() => [...series].reverse().map((entry) => (
    entry.linePath ? <ChartLine key={entry.key} d={entry.linePath} color={entry.color} /> : null
  )), [series]);

  // A zero-filled day gets no dot: a sparse model would otherwise lay a row of dots along
  // the baseline under every other series.
  const dots = useMemo(() => (showDots ? [...series].reverse().flatMap((entry) => entry.points.map((point) => (
    point.value === null || point.value === 0
      ? null
      : <ChartDot key={`${entry.key}-${point.day}`} point={point} color={entry.color} />
  ))) : null), [series, showDots]);

  const hovered = useMemo(
    () => (hoverIndex === null ? null : resolveHoveredDay(series, hoverIndex)),
    [hoverIndex, series],
  );

  return (
    <ChartCard label={label} headerClassName={HEADER_CLASS_NAME} headerRight={legend}>
      <ChartSvg frame={FRAME} ariaLabel={ariaLabel}>
        {axes}
        {lines}

        {hovered ? <ChartHoverGuide frame={FRAME} x={hovered.x} /> : null}

        {dots}

        {hovered ? [...hovered.rows].reverse().map(({ entry, point }) => (
          point.value === null ? null : <ChartHoverMarker key={entry.key} point={point} color={entry.color} />
        )) : null}

        <ChartHoverTarget frame={FRAME} onPointerMove={handlePointerMove} onPointerLeave={handlePointerLeave} />
      </ChartSvg>

      {hovered ? (
        <ChartTooltip frame={FRAME} x={hovered.x} y={hovered.y} keepInPlot>
          <div className="text-[#c3c2b7]">{hovered.day}</div>
          {hovered.rows.map(({ entry, point }) => (
            <div key={entry.key} className="flex items-center gap-1.5">
              <span aria-hidden="true" className="inline-block h-0.5 w-3" style={{ backgroundColor: entry.color }} />
              <span className="text-[#c3c2b7]">{entry.label}</span>
              <span className="ml-auto pl-3 font-semibold" style={{ fontVariantNumeric: "tabular-nums" }}>
                {formatMetricDisplayValue(point.value, kind)}
              </span>
            </div>
          ))}
        </ChartTooltip>
      ) : null}
    </ChartCard>
  );
}

/**
 * Stands in for a MultiLineChartCard while its data loads, or after loading failed. Same
 * card, header and plot frame, so it has the same size and nothing shifts when the chart
 * replaces it; the message sits over the empty plot.
 */
export function MultiLineChartCardPlaceholder({
  label,
  status,
  message,
}: {
  label: string;
  status: "loading" | "error";
  message: string;
}) {
  const isLoading = status === "loading";
  return (
    <ChartCard label={label} headerClassName={HEADER_CLASS_NAME}>
      <svg
        className="w-full"
        aria-hidden="true"
        viewBox={`${FRAME.viewMinX} ${FRAME.viewMinY} ${FRAME.viewWidth} ${FRAME.viewHeight}`}
      >
        {isLoading ? (
          <rect x={0} y={0} width={FRAME.width} height={FRAME.height} rx={6} fill="#f4f3ee" className="animate-pulse" />
        ) : null}
      </svg>
      <div
        role={isLoading ? "status" : "alert"}
        className={[
          "absolute inset-0 flex items-center justify-center gap-1.5 text-xs font-medium",
          isLoading ? "text-[#898781]" : "text-red-600",
        ].join(" ")}
      >
        {isLoading ? (
          <span
            aria-hidden="true"
            className="h-3 w-3 animate-spin rounded-full border-2 border-[#e5e3dc] border-t-[#f59e0b]"
          />
        ) : null}
        {message}
      </div>
    </ChartCard>
  );
}

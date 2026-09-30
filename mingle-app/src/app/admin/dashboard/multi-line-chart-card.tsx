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
  resolveTooltipAlignment,
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

  const hovered = useMemo(
    () => (hoverIndex === null ? null : resolveHoveredDay(series, hoverIndex)),
    [hoverIndex, series],
  );

  // Paint the last series first so the first legend entry ends up on top ("기타" at the bottom).
  const paintOrder = [...series].reverse();

  return (
    <ChartCard
      label={label}
      headerClassName="flex flex-wrap items-center justify-between gap-x-4 gap-y-1"
      headerRight={series.length > 0 ? (
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
      )}
    >
      <ChartSvg frame={FRAME} ariaLabel={ariaLabel}>
        <ChartYGrid frame={FRAME} yMax={yMax} />

        {paintOrder.map((entry) => (entry.linePath ? <ChartLine key={entry.key} d={entry.linePath} color={entry.color} /> : null))}

        {hovered ? <ChartHoverGuide frame={FRAME} x={hovered.x} /> : null}

        {paintOrder.flatMap((entry) => entry.points.map((point) => (
          point.value === null ? null : <ChartDot key={`${entry.key}-${point.day}`} point={point} color={entry.color} />
        )))}

        {hovered ? [...hovered.rows].reverse().map(({ entry, point }) => (
          point.value === null ? null : <ChartHoverMarker key={entry.key} point={point} color={entry.color} />
        )) : null}

        <ChartXAxisLabels frame={FRAME} dayKeys={dayKeys} maxTicks={X_AXIS_MAX_TICKS} />

        <ChartHoverTarget frame={FRAME} onPointerMove={handlePointerMove} onPointerLeave={handlePointerLeave} />
      </ChartSvg>

      {hovered ? (
        <ChartTooltip frame={FRAME} x={hovered.x} y={hovered.y} align={resolveTooltipAlignment(hovered.x, FRAME.width)}>
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

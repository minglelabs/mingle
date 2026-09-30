"use client";

import { useCallback, useMemo, useState, type PointerEvent, type ReactNode } from "react";
import {
  ADMIN_DASHBOARD_CHART_HEIGHT,
  ADMIN_DASHBOARD_CHART_WIDTH,
  type ChartFrame,
  type ChartPoint,
  type MetricKind,
  type TooltipAlignment,
  formatMetricDisplayValue,
  formatShortDay,
  resolveChartFrame,
  resolveHoverIndex,
  resolveXAxisTicks,
} from "@/lib/admin-dashboard-metrics";

const FRAME = resolveChartFrame(ADMIN_DASHBOARD_CHART_WIDTH, ADMIN_DASHBOARD_CHART_HEIGHT);

type HoverPosition = { day: string; value: number | null; x: number; y: number };

/**
 * 커서에서 가장 가까운 데이터 포인트(날짜 노드)를 반환한다.
 * 보간(interpolate) 없이 실제 날짜의 값만 표시하기 위해 snapping 방식으로 변경.
 */
export function snapToNearest(points: readonly ChartPoint[], t: number): HoverPosition | null {
  if (points.length === 0) return null;
  const index = Math.round(Math.min(points.length - 1, Math.max(0, t)));
  const point = points[index];
  if (!point) return null;
  return { day: point.day, value: point.value, x: point.x, y: point.y };
}

/*
 * Building blocks shared by every dashboard chart card, so the single- and multi-series
 * cards keep one visual language (card, grid, axes, dots, hover snapping, tooltip).
 */

/** Which day index the pointer is over, snapped to the nearest real day. */
export function useChartHover(frame: ChartFrame, pointCount: number) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const handlePointerMove = useCallback((event: PointerEvent<SVGRectElement>) => {
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    const index = resolveHoverIndex(event.clientX, svg.getBoundingClientRect(), frame, pointCount);
    if (index !== null) setHoverIndex(index);
  }, [frame, pointCount]);

  const handlePointerLeave = useCallback(() => {
    setHoverIndex(null);
  }, []);

  return { hoverIndex, handlePointerMove, handlePointerLeave };
}

export function ChartCard({
  label,
  headerRight,
  headerClassName = "flex items-center justify-between",
  children,
}: {
  label: string;
  headerRight?: ReactNode;
  headerClassName?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[#e5e3dc] bg-white p-4 shadow-sm">
      <div className={headerClassName}>
        <p className="text-sm font-semibold text-[#0b0b0b]">{label}</p>
        {headerRight}
      </div>

      <div className="relative mt-1.5">{children}</div>
    </div>
  );
}

export function ChartLegendItem({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span aria-hidden="true" className="inline-block h-0.5 w-3" style={{ backgroundColor: color }} />
      {children}
    </span>
  );
}

export function ChartSvg({ frame, ariaLabel, children }: { frame: ChartFrame; ariaLabel: string; children: ReactNode }) {
  return (
    <svg
      className="w-full"
      role="img"
      aria-label={ariaLabel}
      viewBox={`${frame.viewMinX} ${frame.viewMinY} ${frame.viewWidth} ${frame.viewHeight}`}
    >
      {children}
    </svg>
  );
}

/** Horizontal grid lines + right-hand labels at 0, half and the top of the y-scale. */
export function ChartYGrid({ frame, yMax }: { frame: ChartFrame; yMax: number }) {
  const midValue = yMax / 2;
  return (
    <>
      {[0, midValue, yMax].map((tickValue) => {
        const y = frame.height - (tickValue / (yMax || 1)) * frame.height;
        return (
          <g key={tickValue}>
            <line x1={0} x2={frame.width} y1={y} y2={y} stroke="#e1e0d9" strokeWidth={1} />
            <text x={frame.width + 6} y={y + 3} fontSize={10} fill="#898781">
              {Math.round(tickValue).toLocaleString("en-US")}
            </text>
          </g>
        );
      })}
    </>
  );
}

export function ChartXAxisLabels({ frame, dayKeys, maxTicks }: { frame: ChartFrame; dayKeys: readonly string[]; maxTicks: number }) {
  const xAxisTicks = resolveXAxisTicks(dayKeys, frame.width, maxTicks);
  return (
    <>
      {xAxisTicks.map((tick) => (
        <text
          key={tick.day}
          x={tick.x}
          y={frame.height + 20}
          fontSize={10}
          fill="#898781"
          textAnchor={tick.day === dayKeys[0] ? "start" : tick.day === dayKeys[dayKeys.length - 1] ? "end" : "middle"}
        >
          {formatShortDay(tick.day)}
        </text>
      ))}
    </>
  );
}

export function ChartLine({ d, color }: { d: string; color: string }) {
  return <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />;
}

/** Vertical guide line at the hovered day. */
export function ChartHoverGuide({ frame, x }: { frame: ChartFrame; x: number }) {
  return <line x1={x} x2={x} y1={0} y2={frame.height} stroke="#c9c7c0" strokeWidth={1} pointerEvents="none" />;
}

/** Per-day data point dot. */
export function ChartDot({ point, color }: { point: { x: number; y: number }; color: string }) {
  return <circle cx={point.x} cy={point.y} r={2.5} fill={color} stroke="#ffffff" strokeWidth={2} pointerEvents="none" />;
}

/** Enlarged marker on the hovered (snapped) day. */
export function ChartHoverMarker({ point, color }: { point: { x: number; y: number }; color: string }) {
  return <circle cx={point.x} cy={point.y} r={4} fill={color} stroke="#ffffff" strokeWidth={2} pointerEvents="none" />;
}

/** Transparent hit area over the plot that drives hover. Drawn last so it sits on top. */
export function ChartHoverTarget({
  frame,
  onPointerMove,
  onPointerLeave,
}: {
  frame: ChartFrame;
  onPointerMove: (event: PointerEvent<SVGRectElement>) => void;
  onPointerLeave: () => void;
}) {
  return (
    <rect
      x={0}
      y={0}
      width={frame.width}
      height={frame.height}
      fill="transparent"
      className="cursor-crosshair"
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    />
  );
}

const TOOLTIP_TRANSLATE_X: Record<TooltipAlignment, string> = {
  start: "translate-x-0",
  center: "-translate-x-1/2",
  end: "-translate-x-full",
};

/** Dark tooltip placed just above an svg point (x, y), positioned in viewBox percentages. */
export function ChartTooltip({
  frame,
  x,
  y,
  align = "center",
  children,
}: {
  frame: ChartFrame;
  x: number;
  y: number;
  align?: TooltipAlignment;
  children: ReactNode;
}) {
  return (
    <div
      className={`pointer-events-none absolute z-10 ${TOOLTIP_TRANSLATE_X[align]} -translate-y-full whitespace-nowrap rounded-md border border-[rgba(255,255,255,0.10)] bg-[#1a1a19] px-2 py-1 text-xs font-medium text-white shadow-lg`}
      style={{
        left: `${((x - frame.viewMinX) / frame.viewWidth) * 100}%`,
        top: `${(((y - frame.viewMinY) - 6) / frame.viewHeight) * 100}%`,
      }}
    >
      {children}
    </div>
  );
}

type SeriesProps = {
  label: string;
  points: ChartPoint[];
  linePath: string;
  areaPath: string;
  color: string;
};

export function LineChartCard(props: {
  label: string;
  kind: MetricKind;
  ariaLabel: string;
  points: ChartPoint[];
  linePath: string;
  areaPath: string;
  yMax: number;
  color: string;
  secondary?: SeriesProps;
  footer?: string;
}) {
  const {
    label, kind, ariaLabel, points, linePath, areaPath, yMax, color, secondary, footer,
  } = props;
  const { hoverIndex, handlePointerMove, handlePointerLeave } = useChartHover(FRAME, points.length);

  const dayKeys = points.map((point) => point.day);

  const hovered = useMemo(() => (hoverIndex === null ? null : snapToNearest(points, hoverIndex)), [hoverIndex, points]);
  const hoveredSecondary = useMemo(
    () => (hoverIndex === null || !secondary ? null : snapToNearest(secondary.points, hoverIndex)),
    [hoverIndex, secondary],
  );

  return (
    <ChartCard
      label={label}
      headerRight={secondary ? (
        <div className="flex items-center gap-3 text-xs text-[#898781]">
          <ChartLegendItem color={color}>평균</ChartLegendItem>
          <ChartLegendItem color={secondary.color}>{secondary.label}</ChartLegendItem>
        </div>
      ) : footer ? (
        <p className="text-xs font-medium text-[#898781]">{footer}</p>
      ) : null}
    >
      <ChartSvg frame={FRAME} ariaLabel={ariaLabel}>
        <ChartYGrid frame={FRAME} yMax={yMax} />

        {secondary?.areaPath ? <path d={secondary.areaPath} fill={secondary.color} opacity={0.08} /> : null}
        {secondary?.linePath ? <ChartLine d={secondary.linePath} color={secondary.color} /> : null}

        {areaPath ? <path d={areaPath} fill={color} opacity={0.1} /> : null}
        {linePath ? <ChartLine d={linePath} color={color} /> : null}

        {/* 호버 시 해당 날짜에 수직 가이드라인 표시 */}
        {hovered ? <ChartHoverGuide frame={FRAME} x={hovered.x} /> : null}

        {/* 각 날짜별 데이터 포인트 */}
        {points.map((point) => (
          point.value === null ? null : <ChartDot key={point.day} point={point} color={color} />
        ))}

        {/* 호버된 날짜 노드에만 강조 마커 표시 (스냅된 실제 포인트) */}
        {hovered && hovered.value !== null ? <ChartHoverMarker point={hovered} color={color} /> : null}
        {secondary && hoveredSecondary && hoveredSecondary.value !== null ? (
          <ChartHoverMarker point={hoveredSecondary} color={secondary.color} />
        ) : null}

        <ChartXAxisLabels frame={FRAME} dayKeys={dayKeys} maxTicks={6} />

        <ChartHoverTarget frame={FRAME} onPointerMove={handlePointerMove} onPointerLeave={handlePointerLeave} />
      </ChartSvg>

      {/* 툴팁: 스냅된 날짜 노드의 실제 값만 표시 */}
      {hovered ? (
        <ChartTooltip frame={FRAME} x={hovered.x} y={hovered.y}>
          <div className="text-[#c3c2b7]">{hovered.day}</div>
          <div className="font-semibold">{formatMetricDisplayValue(hovered.value, kind)}</div>
          {secondary && hoveredSecondary ? (
            <div className="text-[#c3c2b7]">{secondary.label}: {formatMetricDisplayValue(hoveredSecondary.value, kind)}</div>
          ) : null}
        </ChartTooltip>
      ) : null}
    </ChartCard>
  );
}

"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import {
  ADMIN_DASHBOARD_CHART_HEIGHT,
  ADMIN_DASHBOARD_CHART_WIDTH,
  type ChartFrame,
  type ChartPoint,
  type MetricKind,
  formatCompactNumber,
  formatMetricDisplayValue,
  formatShortDay,
  resolveHoverIndex,
  resolveTooltipShiftPercent,
  resolveXAxisTicks,
} from "@/lib/admin-dashboard-metrics";

const CHART_WIDTH = ADMIN_DASHBOARD_CHART_WIDTH;
const CHART_HEIGHT = ADMIN_DASHBOARD_CHART_HEIGHT;
/** Per-point dots are drawn only while they stay readable (up to about a month). */
const MAX_POINT_DOTS = 45;

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

const TOOLTIP_SURFACE_CLASS_NAME = "whitespace-nowrap rounded-md border border-[rgba(255,255,255,0.10)] bg-[#1a1a19] px-2 py-1 text-xs font-medium text-white shadow-lg";
// Class order matches the markup the single-series cards have always rendered.
const CENTERED_TOOLTIP_CLASS_NAME = `pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full ${TOOLTIP_SURFACE_CLASS_NAME}`;
// Positioned by an inline transform instead of translate utilities.
const IN_PLOT_TOOLTIP_CLASS_NAME = `pointer-events-none absolute z-10 ${TOOLTIP_SURFACE_CLASS_NAME}`;

/**
 * Dark tooltip placed just above an svg point (x, y), positioned in viewBox percentages.
 * By default it is centred on the point. `keepInPlot` instead shifts it left by the
 * point's fraction of the plot width, so a tooltip narrower than the plot never spills
 * past either plot edge -- for tooltips too wide to centre safely near the edges.
 */
export function ChartTooltip({
  frame,
  x,
  y,
  keepInPlot = false,
  children,
}: {
  frame: ChartFrame;
  x: number;
  y: number;
  keepInPlot?: boolean;
  children: ReactNode;
}) {
  const left = `${((x - frame.viewMinX) / frame.viewWidth) * 100}%`;
  const top = `${(((y - frame.viewMinY) - 6) / frame.viewHeight) * 100}%`;
  return (
    <div
      className={keepInPlot ? IN_PLOT_TOOLTIP_CLASS_NAME : CENTERED_TOOLTIP_CLASS_NAME}
      style={keepInPlot
        ? { left, top, transform: `translate(${-resolveTooltipShiftPercent(x, frame.width)}%, -100%)` }
        : { left, top }}
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

function percent(value: number, total: number): string {
  return `${(value / (total || 1)) * 100}%`;
}

/** Keeps a label or tooltip inside the plot: left-aligned near the left edge, right-aligned near the right. */
function edgeAlignedTransform(x: number): string {
  const ratio = x / (CHART_WIDTH || 1);
  if (ratio < 0.15) return "translateX(0)";
  if (ratio > 0.85) return "translateX(-100%)";
  return "translateX(-50%)";
}

/**
 * One metric's line chart. The plot is an SVG stretched to the card
 * (non-scaling strokes); every label is HTML at a fixed 11 px, so text stays
 * readable at 375 px instead of shrinking with the SVG. Values open on tap
 * (touch pins the tooltip until a tap elsewhere), on mouse hover, or with the
 * arrow keys when the chart has focus.
 */
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
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [pinned, setPinned] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<HTMLDivElement>(null);

  const dayKeys = points.map((point) => point.day);
  const xAxisTicks = resolveXAxisTicks(dayKeys, CHART_WIDTH, 6);
  const yTicks = [yMax, yMax / 2, 0];
  const lastIndex = points.length - 1;

  const clear = useCallback(() => {
    setActiveIndex(null);
    setPinned(false);
  }, []);

  // A pinned (tapped) tooltip closes on the next tap outside the chart.
  useEffect(() => {
    if (!pinned) return;
    const handleDocumentPointerDown = (event: globalThis.PointerEvent) => {
      if (!cardRef.current?.contains(event.target as Node)) clear();
    };
    document.addEventListener("pointerdown", handleDocumentPointerDown);
    return () => document.removeEventListener("pointerdown", handleDocumentPointerDown);
  }, [clear, pinned]);

  const indexAt = useCallback((clientX: number): number | null => {
    const plot = plotRef.current;
    if (!plot || points.length === 0) return null;
    const rect = plot.getBoundingClientRect();
    if (rect.width === 0) return null;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return Math.round(ratio * Math.max(0, lastIndex));
  }, [lastIndex, points.length]);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const index = indexAt(event.clientX);
    if (index === null) return;
    setActiveIndex(index);
    setPinned(event.pointerType !== "mouse");
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    // Touch and pen scrub only while pressed; a mouse shows values on hover.
    if (event.pointerType !== "mouse" && (event.buttons & 1) === 0) return;
    const index = indexAt(event.clientX);
    if (index !== null) setActiveIndex(index);
  };

  const handlePointerLeave = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && !pinned) setActiveIndex(null);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (points.length === 0) return;
    const current = activeIndex ?? lastIndex;
    let next: number | null = null;
    if (event.key === "ArrowLeft") next = Math.max(0, current - 1);
    else if (event.key === "ArrowRight") next = Math.min(lastIndex, current + 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = lastIndex;
    else if (event.key === "Escape") {
      clear();
      return;
    }
    if (next === null) return;
    event.preventDefault();
    setActiveIndex(next);
  };

  const active = activeIndex === null ? null : points[activeIndex] ?? null;
  const activeSecondary = activeIndex === null || !secondary ? null : secondary.points[activeIndex] ?? null;
  const valueText = active
    ? `${active.day} ${formatMetricDisplayValue(active.value, kind)}${secondary && activeSecondary ? `, ${secondary.label} ${formatMetricDisplayValue(activeSecondary.value, kind)}` : ""}`
    : "값을 보려면 좌우 화살표를 누르세요";
  const tooltipBelow = active ? active.y / (CHART_HEIGHT || 1) < 0.45 : false;

  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm" ref={cardRef}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="text-sm font-semibold text-slate-900">{label}</p>
        {secondary ? (
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1">
              <span aria-hidden="true" className="inline-block h-0.5 w-3" style={{ backgroundColor: color }} />
              평균
            </span>
            <span className="inline-flex items-center gap-1">
              <span aria-hidden="true" className="inline-block w-3 border-t-2 border-dashed" style={{ borderColor: secondary.color }} />
              {secondary.label}
            </span>
          </div>
        ) : footer ? (
          <p className="text-xs font-medium text-slate-500">{footer}</p>
        ) : null}
      </div>

      <div className="mt-4 flex gap-2">
        <div className="min-w-0 flex-1">
          <div className="relative h-36" ref={plotRef}>
            <svg
              aria-label={ariaLabel}
              className="absolute inset-0 h-full w-full overflow-visible"
              preserveAspectRatio="none"
              role="img"
              viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
            >
              {yTicks.map((tickValue) => {
                const y = CHART_HEIGHT - (tickValue / (yMax || 1)) * CHART_HEIGHT;
                return <line key={tickValue} stroke="#e2e8f0" strokeWidth={1} vectorEffect="non-scaling-stroke" x1={0} x2={CHART_WIDTH} y1={y} y2={y} />;
              })}

              {secondary?.areaPath ? <path d={secondary.areaPath} fill={secondary.color} opacity={0.06} /> : null}
              {secondary?.linePath ? (
                <path d={secondary.linePath} fill="none" stroke={secondary.color} strokeDasharray="6 4" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} vectorEffect="non-scaling-stroke" />
              ) : null}

              {areaPath ? <path d={areaPath} fill={color} opacity={0.1} /> : null}
              {linePath ? <path d={linePath} fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} vectorEffect="non-scaling-stroke" /> : null}

              {active ? (
                <line pointerEvents="none" stroke="#94a3b8" strokeWidth={1} vectorEffect="non-scaling-stroke" x1={active.x} x2={active.x} y1={0} y2={CHART_HEIGHT} />
              ) : null}
            </svg>

            {points.length <= MAX_POINT_DOTS
              ? points.map((point) => (point.value === null ? null : (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white"
                  key={point.day}
                  style={{ left: percent(point.x, CHART_WIDTH), top: percent(point.y, CHART_HEIGHT), backgroundColor: color }}
                />
              )))
              : null}

            {active && active.value !== null ? (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white"
                style={{ left: percent(active.x, CHART_WIDTH), top: percent(active.y, CHART_HEIGHT), backgroundColor: color }}
              />
            ) : null}
            {activeSecondary && activeSecondary.value !== null && secondary ? (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white"
                style={{ left: percent(activeSecondary.x, CHART_WIDTH), top: percent(activeSecondary.y, CHART_HEIGHT), backgroundColor: secondary.color }}
              />
            ) : null}

            {active ? (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute z-10 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg"
                style={{
                  left: percent(active.x, CHART_WIDTH),
                  top: tooltipBelow ? `calc(${percent(active.y, CHART_HEIGHT)} + 10px)` : `calc(${percent(active.y, CHART_HEIGHT)} - 10px)`,
                  transform: `${edgeAlignedTransform(active.x)} ${tooltipBelow ? "" : "translateY(-100%)"}`,
                }}
              >
                <div className="text-slate-300">{active.day}</div>
                <div className="font-semibold">{formatMetricDisplayValue(active.value, kind)}</div>
                {secondary && activeSecondary ? (
                  <div className="text-slate-300">{secondary.label}: {formatMetricDisplayValue(activeSecondary.value, kind)}</div>
                ) : null}
              </div>
            ) : null}

            <div
              aria-label={`${label} 날짜별 값`}
              aria-valuemax={Math.max(0, lastIndex)}
              aria-valuemin={0}
              aria-valuenow={activeIndex ?? Math.max(0, lastIndex)}
              aria-valuetext={valueText}
              className="absolute inset-0 cursor-crosshair touch-pan-y rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-500"
              onBlur={clear}
              onKeyDown={handleKeyDown}
              onPointerDown={handlePointerDown}
              onPointerLeave={handlePointerLeave}
              onPointerMove={handlePointerMove}
              role="slider"
              tabIndex={0}
            />
          </div>

          <div aria-hidden="true" className="relative mt-1.5 h-4">
            {xAxisTicks.map((tick) => (
              <span
                className="absolute top-0 whitespace-nowrap text-[11px] leading-4 text-slate-500"
                key={tick.day}
                style={{ left: percent(tick.x, CHART_WIDTH), transform: edgeAlignedTransform(tick.x) }}
              >
                {formatShortDay(tick.day)}
              </span>
            ))}
          </div>
        </div>

        <div aria-hidden="true" className="relative h-36 w-12 shrink-0">
          {yTicks.map((tickValue) => (
            <span
              className="absolute left-0 -translate-y-1/2 whitespace-nowrap text-[11px] leading-4 tabular-nums text-slate-500"
              key={tickValue}
              style={{ top: percent(CHART_HEIGHT - (tickValue / (yMax || 1)) * CHART_HEIGHT, CHART_HEIGHT) }}
            >
              {formatCompactNumber(Math.round(tickValue))}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

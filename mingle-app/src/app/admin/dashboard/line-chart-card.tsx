"use client";

import { useCallback, useMemo, useState, type PointerEvent } from "react";
import {
  ADMIN_DASHBOARD_CHART_HEIGHT,
  ADMIN_DASHBOARD_CHART_WIDTH,
  type ChartPoint,
  type DeployMarker,
  type MetricKind,
  formatMetricDisplayValue,
  formatShortDay,
  resolveXAxisTicks,
} from "@/lib/admin-dashboard-metrics";

const CHART_WIDTH = ADMIN_DASHBOARD_CHART_WIDTH;
const CHART_HEIGHT = ADMIN_DASHBOARD_CHART_HEIGHT;
const VIEW_MIN_X = -4;
const VIEW_MIN_Y = -8;
const VIEW_WIDTH = CHART_WIDTH + 48;
const VIEW_HEIGHT = CHART_HEIGHT + 30;
/** App's own brand accent (globals.css --primary/--accent), reused here so deploy
 * markers read as "this app's" annotation rather than an arbitrary extra hue. */
const DEPLOY_MARKER_COLOR = "#f59e0b";
const DEPLOY_MARKER_TOOLTIP_COLOR = "#fbbf24";
/** How close (in svg viewBox units) the cursor must be to a deploy line to count as
 * "on" it -- the line itself renders at 1px, far too thin to reliably point at. */
const DEPLOY_MARKER_HOVER_TOLERANCE = 5;

type HoverPosition = { day: string; value: number | null; x: number; y: number };

/**
 * Reads the exact spot on the drawn line under a fractional index `t` (e.g. 2.35 =
 * 35% of the way from point 2 to point 3), instead of snapping to whichever data
 * point is nearest. That's what makes the dot/number glide continuously with the
 * cursor rather than stepping day-to-day.
 */
function interpolateAt(points: readonly ChartPoint[], t: number): HoverPosition | null {
  const lowIndex = Math.floor(t);
  const highIndex = Math.min(points.length - 1, Math.ceil(t));
  const lowPoint = points[lowIndex];
  const highPoint = points[highIndex];
  if (!lowPoint || !highPoint) return null;
  const frac = t - lowIndex;
  const nearestDay = frac < 0.5 ? lowPoint.day : highPoint.day;

  if (lowPoint.value === null && highPoint.value === null) {
    return { day: nearestDay, value: null, x: lowPoint.x + (highPoint.x - lowPoint.x) * frac, y: CHART_HEIGHT };
  }
  // One side of the cursor sits in a data gap -- don't fabricate a number by
  // interpolating across it, just show the side that actually has data.
  if (lowPoint.value === null || highPoint.value === null) {
    const defined = lowPoint.value !== null ? lowPoint : highPoint;
    return { day: defined.day, value: defined.value, x: defined.x, y: defined.y };
  }
  return {
    day: nearestDay,
    value: lowPoint.value + (highPoint.value - lowPoint.value) * frac,
    x: lowPoint.x + (highPoint.x - lowPoint.x) * frac,
    y: lowPoint.y + (highPoint.y - lowPoint.y) * frac,
  };
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
  /** 주요 배포일. 그래프 위에 세로선으로 항상 표시하고, 그 선에 커서를 올리면 별도 툴팁으로 내용을 띄운다. */
  deployMarkers?: DeployMarker[];
}) {
  const {
    label, kind, ariaLabel, points, linePath, areaPath, yMax, color, secondary, footer, deployMarkers,
  } = props;
  const [hoverT, setHoverT] = useState<number | null>(null);
  const [hoveredDeployMarker, setHoveredDeployMarker] = useState<(DeployMarker & { x: number }) | null>(null);

  const dayKeys = points.map((point) => point.day);
  const midValue = yMax / 2;
  const xAxisTicks = resolveXAxisTicks(dayKeys, CHART_WIDTH, 6);
  const bandWidth = points.length > 1 ? CHART_WIDTH / (points.length - 1) : CHART_WIDTH;

  const visibleDeployMarkers = useMemo(() => {
    if (!deployMarkers) return [];
    return deployMarkers
      .map((marker) => {
        const point = points.find((candidate) => candidate.day === marker.date);
        return point ? { ...marker, x: point.x } : null;
      })
      .filter((marker): marker is DeployMarker & { x: number } => marker !== null);
  }, [deployMarkers, points]);

  // Native SVG <title> tooltips require a pixel-precise, held hover on a 5px dot and
  // show only after the browser's own delay -- from the outside that reads as "hover
  // does nothing". This tracks the raw pointer position as a fractional index instead
  // (not rounded), so the marker and value glide continuously with the cursor.
  //
  // The deploy line and the data line are deliberately separate hover targets: sitting
  // on a deploy line shows only what deployed that day, sitting anywhere else on the
  // chart shows only the date/value -- mixing the two into one tooltip made it unclear
  // which one you were actually pointing at.
  const handlePointerMove = useCallback((event: PointerEvent<SVGRectElement>) => {
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0) return;
    const svgX = ((event.clientX - rect.left) / rect.width) * VIEW_WIDTH + VIEW_MIN_X;

    const nearMarker = visibleDeployMarkers.find(
      (marker) => Math.abs(marker.x - svgX) <= DEPLOY_MARKER_HOVER_TOLERANCE,
    );
    if (nearMarker) {
      setHoveredDeployMarker(nearMarker);
      setHoverT(null);
      return;
    }
    setHoveredDeployMarker(null);
    const t = svgX / (bandWidth || 1);
    setHoverT(Math.min(points.length - 1, Math.max(0, t)));
  }, [bandWidth, points.length, visibleDeployMarkers]);

  const handlePointerLeave = useCallback(() => {
    setHoverT(null);
    setHoveredDeployMarker(null);
  }, []);

  const hovered = useMemo(() => (hoverT === null ? null : interpolateAt(points, hoverT)), [hoverT, points]);
  const hoveredSecondary = useMemo(
    () => (hoverT === null || !secondary ? null : interpolateAt(secondary.points, hoverT)),
    [hoverT, secondary],
  );

  return (
    <div className="rounded-xl border border-[#e5e3dc] bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-[#0b0b0b]">{label}</p>
        {secondary ? (
          <div className="flex items-center gap-3 text-xs text-[#898781]">
            <span className="inline-flex items-center gap-1">
              <span aria-hidden="true" className="inline-block h-0.5 w-3" style={{ backgroundColor: color }} />
              평균
            </span>
            <span className="inline-flex items-center gap-1">
              <span aria-hidden="true" className="inline-block h-0.5 w-3" style={{ backgroundColor: secondary.color }} />
              {secondary.label}
            </span>
          </div>
        ) : footer ? (
          <p className="text-xs font-medium text-[#898781]">{footer}</p>
        ) : null}
      </div>

      <div className="relative mt-1.5">
        <svg
          className="w-full"
          role="img"
          aria-label={ariaLabel}
          viewBox={`${VIEW_MIN_X} ${VIEW_MIN_Y} ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        >
          {[0, midValue, yMax].map((tickValue) => {
            const y = CHART_HEIGHT - (tickValue / (yMax || 1)) * CHART_HEIGHT;
            return (
              <g key={tickValue}>
                <line x1={0} x2={CHART_WIDTH} y1={y} y2={y} stroke="#e1e0d9" strokeWidth={1} />
                <text x={CHART_WIDTH + 6} y={y + 3} fontSize={10} fill="#898781">
                  {Math.round(tickValue).toLocaleString("en-US")}
                </text>
              </g>
            );
          })}

          {visibleDeployMarkers.map((marker) => (
            <line
              key={marker.date}
              x1={marker.x}
              x2={marker.x}
              y1={0}
              y2={CHART_HEIGHT}
              stroke={DEPLOY_MARKER_COLOR}
              strokeWidth={1}
              strokeDasharray="3,3"
              opacity={0.6}
              pointerEvents="none"
            />
          ))}

          {secondary?.areaPath ? <path d={secondary.areaPath} fill={secondary.color} opacity={0.08} /> : null}
          {secondary?.linePath ? (
            <path d={secondary.linePath} fill="none" stroke={secondary.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          ) : null}

          {areaPath ? <path d={areaPath} fill={color} opacity={0.1} /> : null}
          {linePath ? <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" /> : null}

          {hovered ? (
            <line x1={hovered.x} x2={hovered.x} y1={0} y2={CHART_HEIGHT} stroke="#c9c7c0" strokeWidth={1} pointerEvents="none" />
          ) : null}

          {points.map((point) => (
            point.value === null ? null : (
              <circle key={point.day} cx={point.x} cy={point.y} r={2.5} fill={color} stroke="#ffffff" strokeWidth={2} pointerEvents="none" />
            )
          ))}

          {/* floating marker that glides to the exact point on the line under the cursor */}
          {hovered && hovered.value !== null ? (
            <circle cx={hovered.x} cy={hovered.y} r={4} fill={color} stroke="#ffffff" strokeWidth={2} pointerEvents="none" />
          ) : null}
          {hoveredSecondary && hoveredSecondary.value !== null ? (
            <circle cx={hoveredSecondary.x} cy={hoveredSecondary.y} r={4} fill={secondary?.color} stroke="#ffffff" strokeWidth={2} pointerEvents="none" />
          ) : null}

          {xAxisTicks.map((tick) => (
            <text
              key={tick.day}
              x={tick.x}
              y={CHART_HEIGHT + 20}
              fontSize={10}
              fill="#898781"
              textAnchor={tick.day === dayKeys[0] ? "start" : tick.day === dayKeys[dayKeys.length - 1] ? "end" : "middle"}
            >
              {formatShortDay(tick.day)}
            </text>
          ))}

          <rect
            x={0}
            y={0}
            width={CHART_WIDTH}
            height={CHART_HEIGHT}
            fill="transparent"
            className="cursor-crosshair"
            onPointerMove={handlePointerMove}
            onPointerLeave={handlePointerLeave}
          />
        </svg>

        {hovered ? (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-[rgba(255,255,255,0.10)] bg-[#1a1a19] px-2 py-1 text-xs font-medium text-white shadow-lg"
            style={{
              left: `${((hovered.x - VIEW_MIN_X) / VIEW_WIDTH) * 100}%`,
              top: `${(((hovered.y - VIEW_MIN_Y) - 6) / VIEW_HEIGHT) * 100}%`,
            }}
          >
            <div className="text-[#c3c2b7]">{hovered.day}</div>
            <div className="font-semibold">{formatMetricDisplayValue(hovered.value, kind)}</div>
            {secondary && hoveredSecondary ? (
              <div className="text-[#c3c2b7]">{secondary.label}: {formatMetricDisplayValue(hoveredSecondary.value, kind)}</div>
            ) : null}
          </div>
        ) : null}

        {hoveredDeployMarker ? (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-[rgba(255,255,255,0.10)] bg-[#1a1a19] px-2 py-1 text-xs font-medium shadow-lg"
            style={{
              left: `${((hoveredDeployMarker.x - VIEW_MIN_X) / VIEW_WIDTH) * 100}%`,
              top: `${((-VIEW_MIN_Y - 6) / VIEW_HEIGHT) * 100}%`,
              color: DEPLOY_MARKER_TOOLTIP_COLOR,
            }}
          >
            <div>{hoveredDeployMarker.date}</div>
            <div className="font-semibold">{hoveredDeployMarker.label}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

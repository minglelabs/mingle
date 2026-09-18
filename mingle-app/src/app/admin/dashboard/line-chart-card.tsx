"use client";

import { useCallback, useMemo, useState, type PointerEvent } from "react";
import {
  ADMIN_DASHBOARD_CHART_HEIGHT,
  ADMIN_DASHBOARD_CHART_WIDTH,
  type ChartPoint,
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

type HoverPosition = { day: string; value: number | null; x: number; y: number };

/**
 * 커서에서 가장 가까운 데이터 포인트(날짜 노드)를 반환한다.
 * 보간(interpolate) 없이 실제 날짜의 값만 표시하기 위해 snapping 방식으로 변경.
 */
function snapToNearest(points: readonly ChartPoint[], t: number): HoverPosition | null {
  if (points.length === 0) return null;
  const index = Math.round(Math.min(points.length - 1, Math.max(0, t)));
  const point = points[index];
  if (!point) return null;
  return { day: point.day, value: point.value, x: point.x, y: point.y };
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
  const [hoverT, setHoverT] = useState<number | null>(null);

  const dayKeys = points.map((point) => point.day);
  const midValue = yMax / 2;
  const xAxisTicks = resolveXAxisTicks(dayKeys, CHART_WIDTH, 6);
  const bandWidth = points.length > 1 ? CHART_WIDTH / (points.length - 1) : CHART_WIDTH;

  // 커서 X를 포인트 배열의 fractional index로 변환하고 반올림(snap)하여
  // 가장 가까운 날짜 노드에만 마커가 붙도록 한다.
  const handlePointerMove = useCallback((event: PointerEvent<SVGRectElement>) => {
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0) return;
    const svgX = ((event.clientX - rect.left) / rect.width) * VIEW_WIDTH + VIEW_MIN_X;
    const t = svgX / (bandWidth || 1);
    setHoverT(Math.min(points.length - 1, Math.max(0, t)));
  }, [bandWidth, points.length]);

  const handlePointerLeave = useCallback(() => {
    setHoverT(null);
  }, []);

  const hovered = useMemo(() => (hoverT === null ? null : snapToNearest(points, hoverT)), [hoverT, points]);
  const hoveredSecondary = useMemo(
    () => (hoverT === null || !secondary ? null : snapToNearest(secondary.points, hoverT)),
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

          {secondary?.areaPath ? <path d={secondary.areaPath} fill={secondary.color} opacity={0.08} /> : null}
          {secondary?.linePath ? (
            <path d={secondary.linePath} fill="none" stroke={secondary.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          ) : null}

          {areaPath ? <path d={areaPath} fill={color} opacity={0.1} /> : null}
          {linePath ? <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" /> : null}

          {/* 호버 시 해당 날짜에 수직 가이드라인 표시 */}
          {hovered ? (
            <line x1={hovered.x} x2={hovered.x} y1={0} y2={CHART_HEIGHT} stroke="#c9c7c0" strokeWidth={1} pointerEvents="none" />
          ) : null}

          {/* 각 날짜별 데이터 포인트 */}
          {points.map((point) => (
            point.value === null ? null : (
              <circle key={point.day} cx={point.x} cy={point.y} r={2.5} fill={color} stroke="#ffffff" strokeWidth={2} pointerEvents="none" />
            )
          ))}

          {/* 호버된 날짜 노드에만 강조 마커 표시 (스냅된 실제 포인트) */}
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

        {/* 툴팁: 스냅된 날짜 노드의 실제 값만 표시 */}
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
      </div>
    </div>
  );
}

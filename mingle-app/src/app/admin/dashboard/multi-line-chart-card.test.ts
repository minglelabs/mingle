import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ADMIN_DASHBOARD_CHART_HEIGHT,
  ADMIN_DASHBOARD_WIDE_CHART_WIDTH,
  buildSharedScaleChartGeometries,
} from "@/lib/admin-dashboard-metrics";
import { MultiLineChartCard, type MultiLineChartSeries, resolveHoveredDay } from "./multi-line-chart-card";

const dayKeys = ["2026-08-02", "2026-08-03", "2026-08-04"];

type SeriesInput = Omit<MultiLineChartSeries, "points" | "linePath"> & { values: number[] };

function project(inputs: SeriesInput[]): { yMax: number; series: MultiLineChartSeries[] } {
  const { yMax, geometries } = buildSharedScaleChartGeometries(
    inputs.map((input) => input.values.map((value, index) => ({ day: dayKeys[index], value }))),
    ADMIN_DASHBOARD_WIDE_CHART_WIDTH,
    ADMIN_DASHBOARD_CHART_HEIGHT,
  );
  return {
    yMax,
    series: inputs.map((input, index) => ({
      key: input.key,
      label: input.label,
      color: input.color,
      total: input.total,
      share: input.share,
      points: geometries[index].points,
      linePath: geometries[index].linePath,
    })),
  };
}

function renderCard(inputs: SeriesInput[]): string {
  const { yMax, series } = project(inputs);
  return renderToStaticMarkup(createElement(MultiLineChartCard, {
    label: "번역 모델별 메시지수",
    kind: "count",
    ariaLabel: "번역 모델별 메시지수 일별 추이",
    dayKeys,
    series,
    yMax,
    emptyMessage: "번역된 메시지 없음",
  }));
}

const gemini: SeriesInput = { key: "gemini-2.5-flash-lite", label: "gemini-2.5-flash-lite", color: "#2a78d6", values: [1, 2, 30], total: 33, share: 0.66 };
const other: SeriesInput = { key: "other", label: "기타", color: "#898781", values: [0, 17, 0], total: 17, share: 0.34 };

describe("MultiLineChartCard", () => {
  it("draws every series on the wide frame with a legend of range totals and shares", () => {
    const html = renderCard([gemini, other]);

    expect(html).toContain('viewBox="-4 -8 1272 170"');
    expect(html.match(/<path /g)).toHaveLength(2);
    expect(html).toContain("번역 모델별 메시지수");
    expect(html).toContain("gemini-2.5-flash-lite");
    expect(html).toContain(">33</span>");
    expect(html).toContain("(66.0%)");
    expect(html).toContain("기타");
    expect(html).toContain(">17</span>");
    expect(html).toContain("(34.0%)");
    expect(html).not.toContain("번역된 메시지 없음");
    // The first legend entry is painted last, i.e. on top of 기타.
    expect(html.indexOf('stroke="#898781" stroke-width="2"'))
      .toBeLessThan(html.indexOf('stroke="#2a78d6" stroke-width="2"'));
  });

  it("keeps the empty frame with axes and says why when nothing was translated", () => {
    const html = renderCard([]);

    expect(html).toContain("번역된 메시지 없음");
    expect(html).not.toContain("<path");
    expect(html).not.toContain("<circle");
    expect(html).toContain("08/02");
    expect(html).toContain("08/04");
  });
});

describe("resolveHoveredDay", () => {
  it("returns every series' value for the hovered day, anchored above the highest marker", () => {
    const { series } = project([gemini, other]);

    const hovered = resolveHoveredDay(series, 1);

    expect(hovered?.day).toBe("2026-08-03");
    expect(hovered?.rows.map(({ entry, point }) => [entry.label, point.value])).toEqual([
      ["gemini-2.5-flash-lite", 2],
      ["기타", 17],
    ]);
    expect(hovered?.x).toBe(series[0].points[1].x);
    expect(hovered?.y).toBe(Math.min(series[0].points[1].y, series[1].points[1].y));
    expect(hovered?.y).toBe(series[1].points[1].y);
  });

  it("has nothing to show without series", () => {
    expect(resolveHoveredDay([], 0)).toBeNull();
  });
});

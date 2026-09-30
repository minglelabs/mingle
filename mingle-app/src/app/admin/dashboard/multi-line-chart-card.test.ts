import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ADMIN_DASHBOARD_CHART_HEIGHT,
  ADMIN_DASHBOARD_WIDE_CHART_WIDTH,
  buildSharedScaleChartGeometries,
  enumerateDayKeys,
} from "@/lib/admin-dashboard-metrics";

// Forces the hovered day index: no pointer event can set it in a server render.
const hover = vi.hoisted(() => ({ index: null as number | null }));
vi.mock("./line-chart-card", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./line-chart-card")>();
  return {
    ...actual,
    useChartHover: () => ({ hoverIndex: hover.index, handlePointerMove: () => {}, handlePointerLeave: () => {} }),
  };
});

import {
  MULTI_LINE_CHART_MAX_DOTTED_DAYS,
  MultiLineChartCard,
  MultiLineChartCardPlaceholder,
  type MultiLineChartSeries,
  resolveHoveredDay,
} from "./multi-line-chart-card";

const dayKeys = ["2026-08-02", "2026-08-03", "2026-08-04"];

type SeriesInput = Omit<MultiLineChartSeries, "points" | "linePath"> & { values: number[] };

function project(inputs: SeriesInput[], days: string[] = dayKeys): { yMax: number; series: MultiLineChartSeries[] } {
  const { yMax, geometries } = buildSharedScaleChartGeometries(
    inputs.map((input) => input.values.map((value, index) => ({ day: days[index], value }))),
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

function renderCard(inputs: SeriesInput[], days: string[] = dayKeys): string {
  const { yMax, series } = project(inputs, days);
  return renderToStaticMarkup(createElement(MultiLineChartCard, {
    label: "번역 모델별 메시지수",
    kind: "count",
    ariaLabel: "번역 모델별 메시지수 일별 추이",
    dayKeys: days,
    series,
    yMax,
    emptyMessage: "번역된 메시지 없음",
  }));
}

function count(html: string, pattern: RegExp): number {
  return html.match(pattern)?.length ?? 0;
}

function tooltipOf(html: string): string {
  return html.slice(html.indexOf('<div class="pointer-events-none'));
}

const gemini: SeriesInput = { key: "gemini-2.5-flash-lite", label: "gemini-2.5-flash-lite", color: "#2a78d6", values: [1, 2, 30], total: 33, share: 0.66 };
const luna: SeriesInput = { key: "gpt-6-luna", label: "gpt-6-luna", color: "#8b5cf6", values: [4, 9, 1], total: 14, share: 0.28 };
const other: SeriesInput = { key: "other", label: "기타", color: "#898781", values: [0, 3, 0], total: 3, share: 0.06 };

afterEach(() => {
  hover.index = null;
});

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
    expect(html).toContain(">3</span>");
    expect(html).toContain("(6.0%)");
    expect(html).not.toContain("번역된 메시지 없음");
    // The first legend entry is painted last, i.e. on top of 기타.
    expect(html.indexOf('stroke="#898781" stroke-width="2"'))
      .toBeLessThan(html.indexOf('stroke="#2a78d6" stroke-width="2"'));
    // Nothing hovered: no guide, markers or tooltip.
    expect(html).not.toContain('stroke="#c9c7c0"');
    expect(html).not.toContain('r="4"');
    expect(html).not.toContain("pointer-events-none absolute");
  });

  it("keeps the empty frame with axes and says why when nothing was translated", () => {
    const html = renderCard([]);

    expect(html).toContain("번역된 메시지 없음");
    expect(html).not.toContain("<path");
    expect(html).not.toContain("<circle");
    expect(html).toContain("08/02");
    expect(html).toContain("08/04");
  });

  it("dots every day with a nonzero value and none for zero-filled days", () => {
    const html = renderCard([gemini, other]);

    expect(count(html, /r="2.5" fill="#2a78d6"/g)).toBe(3);
    // 기타 is 0 on two of the three days.
    expect(count(html, /r="2.5" fill="#898781"/g)).toBe(1);
  });

  it(`draws no per-day dots past ${MULTI_LINE_CHART_MAX_DOTTED_DAYS} days but still marks the hovered day`, () => {
    const inputs = (length: number) => [
      { ...gemini, values: Array.from({ length }, (_, index) => index + 1) },
      { ...luna, values: Array.from({ length }, () => 2) },
    ];
    const atLimit = enumerateDayKeys("2026-09-30", MULTI_LINE_CHART_MAX_DOTTED_DAYS);
    const pastLimit = enumerateDayKeys("2026-09-30", MULTI_LINE_CHART_MAX_DOTTED_DAYS + 1);

    expect(count(renderCard(inputs(atLimit.length), atLimit), /r="2.5"/g)).toBe(2 * MULTI_LINE_CHART_MAX_DOTTED_DAYS);
    hover.index = 10;
    const html = renderCard(inputs(pastLimit.length), pastLimit);
    expect(count(html, /r="2.5"/g)).toBe(0);
    expect(count(html, /r="4"/g)).toBe(2);
    expect(html.match(/<path /g)).toHaveLength(2);
  });

  it("marks every series on the hovered day and lists them in the tooltip in series order", () => {
    hover.index = 1;
    const html = renderCard([gemini, luna, other]);

    const markers = [...html.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="4" fill="(#[0-9a-f]+)"/g)];
    // One marker per series, painted in reverse so the first series sits on top.
    expect(markers.map((marker) => marker[3])).toEqual(["#898781", "#8b5cf6", "#2a78d6"]);
    expect(new Set(markers.map((marker) => marker[1]))).toEqual(new Set(["612"]));
    expect(html).toContain('<line x1="612" x2="612" y1="0" y2="140" stroke="#c9c7c0"');

    const tooltip = tooltipOf(html);
    expect(tooltip).toContain('<div class="text-[#c3c2b7]">2026-08-03</div>');
    const rows = [...tooltip.matchAll(/<span class="text-\[#c3c2b7\]">([^<]+)<\/span><span class="ml-auto pl-3 font-semibold"[^>]*>([^<]+)<\/span>/g)];
    expect(rows.map((row) => [row[1], row[2]])).toEqual([
      ["gemini-2.5-flash-lite", "2"],
      ["gpt-6-luna", "9"],
      ["기타", "3"],
    ]);
  });

  it.each([
    [0, "translate(0%, -100%)"],
    [1, "translate(-50%, -100%)"],
    [2, "translate(-100%, -100%)"],
  ])("shifts the tooltip in proportion to the hovered day's position (index %i)", (index, transform) => {
    hover.index = index;
    const tooltip = tooltipOf(renderCard([gemini, luna, other]));

    expect(tooltip).toMatch(new RegExp(`^<div class="pointer-events-none absolute z-10 whitespace-nowrap [^"]*" style="left:[\\d.]+%;top:[\\d.]+%;transform:${transform.replace(/[()]/g, "\\$&")}">`));
    expect(tooltip).not.toContain("-translate-x-1/2");
    expect(tooltip).not.toContain("-translate-y-full");
  });
});

describe("MultiLineChartCardPlaceholder", () => {
  it("keeps the chart's frame so swapping in the chart does not shift the page", () => {
    const loading = renderToStaticMarkup(createElement(MultiLineChartCardPlaceholder, {
      label: "번역 모델별 메시지수",
      status: "loading",
      message: "불러오는 중...",
    }));
    const error = renderToStaticMarkup(createElement(MultiLineChartCardPlaceholder, {
      label: "번역 모델별 메시지수",
      status: "error",
      message: "번역 모델별 데이터를 불러오지 못했습니다.",
    }));

    for (const html of [loading, error]) {
      expect(html).toContain('<div class="rounded-xl border border-[#e5e3dc] bg-white p-4 shadow-sm">');
      expect(html).toContain("번역 모델별 메시지수");
      expect(html).toContain('<svg class="w-full" aria-hidden="true" viewBox="-4 -8 1272 170">');
    }
    expect(loading).toContain('role="status"');
    expect(loading).toContain("animate-pulse");
    expect(loading).toContain("불러오는 중...");
    expect(error).toContain('role="alert"');
    expect(error).toContain("text-red-600");
    expect(error).toContain("번역 모델별 데이터를 불러오지 못했습니다.");
    expect(error).not.toContain("animate-");
  });
});

describe("resolveHoveredDay", () => {
  it("returns every series' value for the hovered day, anchored above the highest marker", () => {
    const { series } = project([gemini, other]);

    const hovered = resolveHoveredDay(series, 1);

    expect(hovered?.day).toBe("2026-08-03");
    expect(hovered?.rows.map(({ entry, point }) => [entry.label, point.value])).toEqual([
      ["gemini-2.5-flash-lite", 2],
      ["기타", 3],
    ]);
    expect(hovered?.x).toBe(series[0].points[1].x);
    expect(hovered?.y).toBe(Math.min(series[0].points[1].y, series[1].points[1].y));
    expect(hovered?.y).toBe(series[1].points[1].y);
  });

  it("has nothing to show without series", () => {
    expect(resolveHoveredDay([], 0)).toBeNull();
  });
});

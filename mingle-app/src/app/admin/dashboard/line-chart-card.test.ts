import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ADMIN_DASHBOARD_CHART_HEIGHT,
  ADMIN_DASHBOARD_CHART_WIDTH,
  type DailyPoint,
  buildChartGeometry,
  buildCumulativeSeries,
  buildSharedScaleChartGeometries,
} from "@/lib/admin-dashboard-metrics";

// The hovered/pinned day index is the card's only `null`-initialised state; forcing it
// renders the active-day layer on the server, where no pointer event can set it.
const hover = vi.hoisted(() => ({ index: null as number | null }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => (hover.index !== null && initial === null ? [hover.index, () => {}] : actual.useState(initial)),
  };
});

import { LineChartCard } from "./line-chart-card";

const W = ADMIN_DASHBOARD_CHART_WIDTH;
const H = ADMIN_DASHBOARD_CHART_HEIGHT;
const days = ["2026-08-02", "2026-08-03", "2026-08-04", "2026-08-05"];

function series(values: (number | null)[]): DailyPoint[] {
  return values.map((value, index) => ({ day: days[index], value }));
}

type LineChartCardProps = Parameters<typeof LineChartCard>[0];

/** Props as page.tsx builds them for a daily card, with or without a p95 secondary. */
function dailyProps(label: string, kind: LineChartCardProps["kind"], primary: DailyPoint[], p95?: DailyPoint[]): LineChartCardProps {
  const { geometries: [geometry, secondary] } = buildSharedScaleChartGeometries(p95 ? [primary, p95] : [primary], W, H);
  return {
    label,
    kind,
    ariaLabel: `${label} 일별 추이`,
    points: geometry.points,
    linePath: geometry.linePath,
    areaPath: geometry.areaPath,
    yMax: geometry.yMax,
    color: "#2a78d6",
    secondary: p95 && secondary ? {
      label: "p95",
      points: secondary.points,
      linePath: secondary.linePath,
      areaPath: secondary.areaPath,
      color: "#eb6834",
    } : undefined,
  };
}

function render(props: LineChartCardProps): string {
  return renderToStaticMarkup(createElement(LineChartCard, props));
}

function count(html: string, pattern: RegExp): number {
  return html.match(pattern)?.length ?? 0;
}

const CARD_OPEN = '<div class="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">';
const DOT = /class="pointer-events-none absolute h-1\.5 w-1\.5 /g;
const ACTIVE_MARKER = /class="pointer-events-none absolute h-3 w-3 /g;
const TOOLTIP_CLASS = "pointer-events-none absolute z-10 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg";

function percent(value: number, total: number): string {
  return `${(value / total) * 100}%`;
}

function expectFrame(html: string, label: string, ariaLabel: string, yLabels: string[]) {
  const head = `${CARD_OPEN}<p class="text-sm font-semibold text-slate-900">${label}</p>`;
  expect(html.slice(0, head.length)).toBe(head);
  // The plot stretches to the card; every label is HTML, outside the svg.
  expect(html).toContain(`<svg aria-label="${ariaLabel}" class="absolute inset-0 h-full w-full overflow-visible" preserveAspectRatio="none" role="img" viewBox="0 0 ${W} ${H}">`);
  expect(html).not.toContain("<text");
  // Grid at the top / half / 0, labelled on the right.
  for (const y of [0, 70, 140]) {
    expect(html).toContain(`<line stroke="#e2e8f0" stroke-width="1" vector-effect="non-scaling-stroke" x1="0" x2="${W}" y1="${y}" y2="${y}"></line>`);
  }
  for (const [index, top] of ["0%", "50%", "100%"].entries()) {
    expect(html).toContain(`style="top:${top}">${yLabels[index]}</span>`);
  }
  expect(html).toContain(">08/02</span>");
  expect(html).toContain(">08/05</span>");
  // The keyboard/touch target covers the plot.
  expect(html).toContain(`aria-label="${label} 날짜별 값" aria-valuemax="3" aria-valuemin="0"`);
  expect(html).toContain('role="slider" tabindex="0"');
}

afterEach(() => {
  hover.index = null;
});

describe("LineChartCard markup", () => {
  it("daily card with a single series", () => {
    const props = dailyProps("메시지수", "count", series([3, 0, 7, 5]));
    const html = render(props);

    expectFrame(html, "메시지수", "메시지수 일별 추이", ["10", "5", "0"]);
    // No legend or footer beside the label.
    expect(html).toContain('<p class="text-sm font-semibold text-slate-900">메시지수</p></div>');
    expect(html).toContain(`<path d="${props.areaPath}" fill="#2a78d6" opacity="0.1"></path>`);
    expect(html).toContain(`<path d="${props.linePath}" fill="none" stroke="#2a78d6" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" vector-effect="non-scaling-stroke"></path>`);
    expect(count(html, /<path /g)).toBe(2);
    // A dot for every day with a value, zeros included.
    expect(count(html, DOT)).toBe(4);
    expect(html).toContain(`style="left:${percent(props.points[1].x, W)};top:100%;background-color:#2a78d6"`);
    expect(count(html, ACTIVE_MARKER)).toBe(0);
    expect(html).not.toContain(TOOLTIP_CLASS);
  });

  it("daily card with a p95 secondary on the shared scale", () => {
    const props = dailyProps("STT 지연시간", "milliseconds", series([120, 150, null, 180]), series([340, 300, null, 410]));
    const html = render(props);

    expectFrame(html, "STT 지연시간", "STT 지연시간 일별 추이", ["500", "250", "0"]);
    expect(html).toContain(
      '<div class="flex items-center gap-3 text-xs text-slate-500">'
      + '<span class="inline-flex items-center gap-1"><span aria-hidden="true" class="inline-block h-0.5 w-3" style="background-color:#2a78d6"></span>평균</span>'
      + '<span class="inline-flex items-center gap-1"><span aria-hidden="true" class="inline-block w-3 border-t-2 border-dashed" style="border-color:#eb6834"></span>p95</span></div>',
    );
    const secondary = props.secondary!;
    const secondaryArea = `<path d="${secondary.areaPath}" fill="#eb6834" opacity="0.06"></path>`;
    const primaryArea = `<path d="${props.areaPath}" fill="#2a78d6" opacity="0.1"></path>`;
    // p95 is painted underneath the average, as a dashed line.
    expect(html.indexOf(secondaryArea)).toBeGreaterThan(-1);
    expect(html.indexOf(secondaryArea)).toBeLessThan(html.indexOf(primaryArea));
    expect(html).toContain(`<path d="${secondary.linePath}" fill="none" stroke="#eb6834" stroke-dasharray="6 4"`);
    // The null day breaks both lines and gets no dot; p95 never gets per-day dots.
    expect(props.linePath.match(/M/g)).toHaveLength(2);
    expect(count(html, DOT)).toBe(3);
    expect(html).not.toContain("background-color:#eb6834");
  });

  it("cumulative card with a footer", () => {
    const cumulative = buildCumulativeSeries(series([2, 3, 0, 4]));
    const geometry = buildChartGeometry(cumulative, W, H);
    const html = render({
      label: "가입자수",
      kind: "count",
      ariaLabel: "가입자수 누적 추이",
      points: geometry.points,
      linePath: geometry.linePath,
      areaPath: geometry.areaPath,
      yMax: geometry.yMax,
      color: "#1baf7a",
      footer: "누적 합계 9",
    });

    expectFrame(html, "가입자수", "가입자수 누적 추이", ["10", "5", "0"]);
    expect(html).toContain('<p class="text-sm font-semibold text-slate-900">가입자수</p><p class="text-xs font-medium text-slate-500">누적 합계 9</p></div>');
    expect(html).toContain(`<path d="${geometry.areaPath}" fill="#1baf7a" opacity="0.1"></path>`);
    expect(count(html, DOT)).toBe(4);
  });

  it("shows the tooltip, guide and markers of the active day", () => {
    const props = dailyProps("STT 지연시간", "milliseconds", series([120, 150, null, 180]), series([340, 300, null, 410]));
    hover.index = 1;
    const html = render(props);
    const primary = props.points[1];
    const secondary = props.secondary!.points[1];

    expect(html).toContain(
      `<line pointer-events="none" stroke="#94a3b8" stroke-width="1" vector-effect="non-scaling-stroke" x1="${primary.x}" x2="${primary.x}" y1="0" y2="${H}"></line>`,
    );
    expect(count(html, ACTIVE_MARKER)).toBe(2);
    expect(html).toContain(`style="left:${percent(primary.x, W)};top:${percent(primary.y, H)};background-color:#2a78d6"`);
    expect(html).toContain(`style="left:${percent(secondary.x, W)};top:${percent(secondary.y, H)};background-color:#eb6834"`);
    expect(html).toContain(`class="${TOOLTIP_CLASS}"`);
    expect(html).toContain(
      '<div class="text-slate-300">2026-08-03</div><div class="font-semibold">150ms</div>'
      + '<div class="text-slate-300">p95: 300ms</div></div>',
    );
    expect(html).toContain('aria-valuenow="1" aria-valuetext="2026-08-03 150ms, p95 300ms"');
  });

  it("shows the tooltip of a day without a value, with no marker", () => {
    const props = dailyProps("STT 지연시간", "milliseconds", series([120, 150, null, 180]), series([340, 300, null, 410]));
    hover.index = 2;
    const html = render(props);

    expect(count(html, ACTIVE_MARKER)).toBe(0);
    expect(html).toContain('<div class="text-slate-300">2026-08-04</div><div class="font-semibold">—</div>');
  });
});

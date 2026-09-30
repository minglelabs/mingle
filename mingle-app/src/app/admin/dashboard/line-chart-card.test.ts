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

// The card's only state is the hovered day index (useChartHover's useState); forcing it
// renders the hover layer on the server, where no pointer event can set it.
const hover = vi.hoisted(() => ({ index: null as number | null }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => (hover.index === null ? actual.useState(initial) : [hover.index, () => {}]),
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

function tooltipPosition(x: number, y: number): string {
  return `left:${((x + 4) / (W + 48)) * 100}%;top:${(((y + 8) - 6) / (H + 30)) * 100}%`;
}

const CARD_OPEN = '<div class="rounded-xl border border-[#e5e3dc] bg-white p-4 shadow-sm"><div class="flex items-center justify-between">';
const HOVER_TARGET = '<rect x="0" y="0" width="560" height="140" fill="transparent" class="cursor-crosshair"></rect></svg>';
const TOOLTIP_CLASS = "pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-[rgba(255,255,255,0.10)] bg-[#1a1a19] px-2 py-1 text-xs font-medium text-white shadow-lg";

function expectFrame(html: string, label: string, ariaLabel: string, yLabels: string[]) {
  const head = `${CARD_OPEN}<p class="text-sm font-semibold text-[#0b0b0b]">${label}</p>`;
  expect(html.slice(0, head.length)).toBe(head);
  expect(html).toContain(`<div class="relative mt-1.5"><svg class="w-full" role="img" aria-label="${ariaLabel}" viewBox="-4 -8 608 170">`);
  // Grid at 0 / half / top, labelled on the right.
  for (const [index, y] of [140, 70, 0].entries()) {
    expect(html).toContain(
      `<g><line x1="0" x2="560" y1="${y}" y2="${y}" stroke="#e1e0d9" stroke-width="1"></line><text x="566" y="${y + 3}" font-size="10" fill="#898781">${yLabels[index]}</text></g>`,
    );
  }
  expect(html).toContain('<text x="0" y="160" font-size="10" fill="#898781" text-anchor="start">08/02</text>');
  expect(html).toContain('<text x="560" y="160" font-size="10" fill="#898781" text-anchor="end">08/05</text>');
  expect(count(html, /<text x="[\d.]+" y="160"/g)).toBe(4);
  // Unhovered: the hit area is the last thing drawn and no tooltip follows it.
  const tail = `${HOVER_TARGET}</div></div>`;
  expect(html.slice(-tail.length)).toBe(tail);
}

afterEach(() => {
  hover.index = null;
});

describe("LineChartCard markup", () => {
  it("daily card with a single series", () => {
    const props = dailyProps("메시지수", "count", series([3, 0, 7, 5]));
    const html = render(props);

    expectFrame(html, "메시지수", "메시지수 일별 추이", ["0", "5", "10"]);
    // No legend or footer beside the label.
    expect(html).toContain('<p class="text-sm font-semibold text-[#0b0b0b]">메시지수</p></div>');
    expect(html).toContain(`<path d="${props.areaPath}" fill="#2a78d6" opacity="0.1"></path>`);
    expect(html).toContain(
      `<path d="${props.linePath}" fill="none" stroke="#2a78d6" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"></path>`,
    );
    expect(count(html, /<path /g)).toBe(2);
    // A dot for every day with a value, zeros included.
    expect(count(html, /r="2.5" fill="#2a78d6" stroke="#ffffff" stroke-width="2" pointer-events="none"/g)).toBe(4);
    expect(html).toContain(`<circle cx="${props.points[1].x}" cy="140" r="2.5"`);
    expect(html).not.toContain('r="4"');
    expect(html).not.toContain("pointer-events-none absolute");
  });

  it("daily card with a p95 secondary on the shared scale", () => {
    const props = dailyProps("STT 지연시간", "milliseconds", series([120, 150, null, 180]), series([340, 300, null, 410]));
    const html = render(props);

    expectFrame(html, "STT 지연시간", "STT 지연시간 일별 추이", ["0", "250", "500"]);
    expect(html).toContain(
      '<div class="flex items-center gap-3 text-xs text-[#898781]">'
      + '<span class="inline-flex items-center gap-1"><span aria-hidden="true" class="inline-block h-0.5 w-3" style="background-color:#2a78d6"></span>평균</span>'
      + '<span class="inline-flex items-center gap-1"><span aria-hidden="true" class="inline-block h-0.5 w-3" style="background-color:#eb6834"></span>p95</span></div>',
    );
    const secondary = props.secondary!;
    const secondaryArea = `<path d="${secondary.areaPath}" fill="#eb6834" opacity="0.08"></path>`;
    const primaryArea = `<path d="${props.areaPath}" fill="#2a78d6" opacity="0.1"></path>`;
    // p95 is painted underneath the average.
    expect(html.indexOf(secondaryArea)).toBeGreaterThan(-1);
    expect(html.indexOf(secondaryArea)).toBeLessThan(html.indexOf(primaryArea));
    expect(html).toContain(`<path d="${secondary.linePath}" fill="none" stroke="#eb6834" stroke-width="2"`);
    // The null day breaks both lines and gets no dot; p95 never gets per-day dots.
    expect(props.linePath.match(/M/g)).toHaveLength(2);
    expect(count(html, /r="2.5"/g)).toBe(3);
    expect(count(html, /r="2.5" fill="#eb6834"/g)).toBe(0);
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

    expectFrame(html, "가입자수", "가입자수 누적 추이", ["0", "5", "10"]);
    expect(html).toContain('<p class="text-sm font-semibold text-[#0b0b0b]">가입자수</p><p class="text-xs font-medium text-[#898781]">누적 합계 9</p></div>');
    expect(html).toContain(`<path d="${geometry.areaPath}" fill="#1baf7a" opacity="0.1"></path>`);
    expect(count(html, /r="2.5" fill="#1baf7a"/g)).toBe(4);
  });

  it("keeps the centred tooltip, guide and markers on hover", () => {
    const props = dailyProps("STT 지연시간", "milliseconds", series([120, 150, null, 180]), series([340, 300, null, 410]));
    hover.index = 1;
    const html = render(props);
    const primary = props.points[1];
    const secondary = props.secondary!.points[1];

    expect(html).toContain(
      `<line x1="${primary.x}" x2="${primary.x}" y1="0" y2="140" stroke="#c9c7c0" stroke-width="1" pointer-events="none"></line>`,
    );
    expect(html).toContain(`<circle cx="${primary.x}" cy="${primary.y}" r="4" fill="#2a78d6" stroke="#ffffff" stroke-width="2" pointer-events="none"></circle>`);
    expect(html).toContain(`<circle cx="${secondary.x}" cy="${secondary.y}" r="4" fill="#eb6834" stroke="#ffffff" stroke-width="2" pointer-events="none"></circle>`);
    const tooltipTail = `${HOVER_TARGET}<div class="${TOOLTIP_CLASS}" style="${tooltipPosition(primary.x, primary.y)}">`
      + '<div class="text-[#c3c2b7]">2026-08-03</div><div class="font-semibold">150ms</div>'
      + '<div class="text-[#c3c2b7]">p95: 300ms</div></div></div></div>';
    expect(html.slice(-tooltipTail.length)).toBe(tooltipTail);
  });

  it("anchors the tooltip on a day without a value at the baseline, with no marker", () => {
    const props = dailyProps("STT 지연시간", "milliseconds", series([120, 150, null, 180]), series([340, 300, null, 410]));
    hover.index = 2;
    const html = render(props);

    expect(count(html, /r="4"/g)).toBe(0);
    expect(html).toContain(`style="${tooltipPosition(props.points[2].x, 140)}"><div class="text-[#c3c2b7]">2026-08-04</div><div class="font-semibold">—</div>`);
  });
});

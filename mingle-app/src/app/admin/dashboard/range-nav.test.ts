import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ADMIN_DASHBOARD_PRESET_OPTIONS, type AdminDashboardTab } from "@/lib/admin-dashboard-metrics";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("./actions", () => ({ clearDashboardCacheAction: vi.fn() }));

import { RangeNav } from "./range-nav";

function renderRangeNav(activeTab: AdminDashboardTab) {
  return renderToStaticMarkup(createElement(RangeNav, {
    presetOptions: ADMIN_DASHBOARD_PRESET_OPTIONS,
    activeTab,
    activeDays: 7,
    activePlatform: "ios",
  }));
}

describe("RangeNav on each dashboard tab", () => {
  it.each<AdminDashboardTab>(["usage", "models"])("shows the OS filter on %s", (tab) => {
    const html = renderRangeNav(tab);
    expect(html).toContain('aria-label="OS 선택"');
    expect(html).toContain("사용자별 최근 확인 OS 기준");
  });

  it.each<AdminDashboardTab>(["growth", "sns", "operators"])("hides the OS filter on %s, whose queries ignore it", (tab) => {
    const html = renderRangeNav(tab);
    expect(html).not.toContain('aria-label="OS 선택"');
    expect(html).not.toContain("사용자별 최근 확인 OS 기준");
    expect(html).toContain('aria-label="기간 선택"');
  });

  it("shows the cache refresh only on 사용량·성능, the one tab that reads the cache", () => {
    expect(renderRangeNav("usage")).toContain("캐시 비우고 다시 계산");
    for (const tab of ["growth", "models", "sns", "operators"] as const) {
      expect(renderRangeNav(tab)).not.toContain("캐시 비우고 다시 계산");
    }
  });
});

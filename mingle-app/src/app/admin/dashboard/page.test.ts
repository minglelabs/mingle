import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { AdminDashboardTab } from "@/lib/admin-dashboard-metrics";

const m = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  startAdminDashboardMetricsLoad: vi.fn(),
  loadTranslationModelMessageSeries: vi.fn(),
  loadSignupRetention: vi.fn(),
  startSnsMetricQueries: vi.fn(),
  startOperatorPostStatsDashboardLoad: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/server/admin/guard", () => ({ requireAdmin: m.requireAdmin }));
vi.mock("./actions", () => ({ clearDashboardCacheAction: vi.fn() }));
vi.mock("@/lib/admin-dashboard-query", () => ({
  startAdminDashboardMetricsLoad: m.startAdminDashboardMetricsLoad,
  loadTranslationModelMessageSeries: m.loadTranslationModelMessageSeries,
}));
vi.mock("@/lib/admin-dashboard-retention", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin-dashboard-retention")>()),
  loadSignupRetention: m.loadSignupRetention,
}));
vi.mock("@/lib/admin-dashboard-sns", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin-dashboard-sns")>()),
  startSnsMetricQueries: m.startSnsMetricQueries,
}));
vi.mock("@/server/operator-post-stats/load", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/operator-post-stats/load")>()),
  startOperatorPostStatsDashboardLoad: m.startOperatorPostStatsDashboardLoad,
}));

import { SNS_METRIC_KEYS } from "@/lib/admin-dashboard-sns";
import { DashboardTabNav } from "./dashboard-tab-nav";
import AdminDashboardPage from "./page";

/** The DB-facing start behind each tab. */
const TAB_LOADS: Record<AdminDashboardTab, Mock> = {
  growth: m.loadSignupRetention,
  usage: m.startAdminDashboardMetricsLoad,
  models: m.loadTranslationModelMessageSeries,
  sns: m.startSnsMetricQueries,
  operators: m.startOperatorPostStatsDashboardLoad,
};

/** What each start returns, built from one promise per query, so a test can keep every query running. */
function stubLoads(query: () => Promise<unknown>) {
  m.loadSignupRetention.mockImplementation(query);
  m.startAdminDashboardMetricsLoad.mockImplementation(query);
  m.loadTranslationModelMessageSeries.mockImplementation(query);
  m.startSnsMetricQueries.mockImplementation(() => Object.fromEntries(SNS_METRIC_KEYS.map((key) => [key, query()])));
  m.startOperatorPostStatsDashboardLoad.mockImplementation(() => ({ countTotals: query(), totals: query(), dashboard: query() }));
}

function renderPage(params: Record<string, string>) {
  return AdminDashboardPage({ searchParams: Promise.resolve(params) });
}

function expectOnlyLoad(tab: AdminDashboardTab) {
  for (const [key, load] of Object.entries(TAB_LOADS)) {
    expect(load, key).toHaveBeenCalledTimes(key === tab ? 1 : 0);
  }
}

describe("/admin/dashboard tabs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.requireAdmin.mockResolvedValue({ sessionId: "session_1", ip: null, userAgent: null });
    stubLoads(() => Promise.resolve([]));
  });

  it.each(Object.keys(TAB_LOADS) as AdminDashboardTab[])("runs only the %s tab's query, after the admin check", async (tab) => {
    await renderPage({ tab, days: "7", platform: "ios" });

    expect(m.requireAdmin).toHaveBeenCalledWith(`/admin/dashboard?tab=${tab}&days=7&platform=ios`);
    expectOnlyLoad(tab);
    const load = TAB_LOADS[tab];
    expect(m.requireAdmin.mock.invocationCallOrder[0]).toBeLessThan(load.mock.invocationCallOrder[0]);
    expect(load.mock.calls[0][0].dayKeys).toHaveLength(7);
  });

  it.each(Object.keys(TAB_LOADS) as AdminDashboardTab[])("renders the %s page without waiting for any of its data", async (tab) => {
    // Every query stays running for the whole test.
    stubLoads(() => new Promise<never>(() => {}));

    const page = await Promise.race([
      renderPage({ tab, days: "30" }),
      new Promise<"blocked">((resolve) => setTimeout(() => resolve("blocked"), 100)),
    ]);

    expect(page).not.toBe("blocked");
    expectOnlyLoad(tab);
  });

  it("passes the OS filter and ?refresh to the tabs that take them", async () => {
    await renderPage({ tab: "usage", days: "7", platform: "ios", refresh: "1" });
    expect(m.startAdminDashboardMetricsLoad.mock.calls[0][1]).toEqual({ forceRefresh: true, platform: "ios" });

    await renderPage({ tab: "models", days: "7", platform: "android" });
    expect(m.loadTranslationModelMessageSeries.mock.calls[0][1]).toEqual({ platform: "android" });
  });

  it.each<Record<string, string>>([{}, { tab: "revenue" }, { tab: "SNS" }])("opens 가입·리텐션 for %o", async (params) => {
    await renderPage(params);

    expect(m.requireAdmin).toHaveBeenCalledWith("/admin/dashboard?tab=growth&days=30");
    expectOnlyLoad("growth");
  });

  it("runs no query when the admin session check redirects", async () => {
    m.requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(renderPage({ tab: "usage" })).rejects.toThrow("NEXT_REDIRECT");
    for (const load of Object.values(TAB_LOADS)) expect(load).not.toHaveBeenCalled();
  });
});

describe("DashboardTabNav", () => {
  it("links every tab with the current range and OS and marks the open one", () => {
    const html = renderToStaticMarkup(createElement(DashboardTabNav, { activeTab: "sns", days: 7, platform: "ios" }));

    expect(html).toContain('aria-label="대시보드 탭"');
    for (const tab of Object.keys(TAB_LOADS)) {
      expect(html).toContain(`href="/admin/dashboard?tab=${tab}&amp;days=7&amp;platform=ios"`);
    }
    for (const label of ["가입·리텐션", "사용량·성능", "번역 모델", "SNS", "운영 계정 글"]) expect(html).toContain(label);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    const current = html.match(/<a [^>]*aria-current="page"[^>]*>([^<]*)<\/a>/);
    expect(current?.[1]).toBe("SNS");
    expect(current?.[0]).toContain('href="/admin/dashboard?tab=sns&amp;days=7&amp;platform=ios"');
  });
});

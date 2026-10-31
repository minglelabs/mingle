import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import {
  normalizeDashboardPlatform,
  ADMIN_DASHBOARD_PRESET_OPTIONS,
  type AdminDashboardDateRange,
  type AdminDashboardPlatform,
  type AdminDashboardTab,
  buildAdminDashboardHref,
  normalizeDashboardDays,
  normalizeDashboardTab,
  resolveAdminDashboardRange,
} from "@/lib/admin-dashboard-metrics";
import { requireAdmin } from "@/server/admin/guard";
import { AdminPage, AdminPageHeader } from "../_components/ui";
import { DashboardTabNav } from "./dashboard-tab-nav";
import { RangeNav } from "./range-nav";
import { OperatorPostStatsSection, startOperatorPostStatsLoad } from "./operator-post-stats-section";
import { RetentionSection, RetentionSectionFallback, startSignupRetentionLoad } from "./retention-section";
import { SnsSection, startSnsDashboardLoad } from "./sns-section";
import {
  TranslationModelSection,
  TranslationModelSectionFallback,
  startTranslationModelSeriesLoad,
} from "./translation-model-section";
import { UsageMetricsSection, UsageMetricsSectionFallback, startUsageMetricsLoad } from "./usage-metrics-section";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "대시보드",
};

type DashboardPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function takeFirst(value: string | string[] | undefined): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? "";
  return "";
}

type DashboardTabInput = {
  range: AdminDashboardDateRange;
  days: number;
  platform: AdminDashboardPlatform;
  forceRefresh: boolean;
};

// No renderer awaits its data. The queries start without an await and each card awaits
// only its own inside its own Suspense boundary: the header, tab bar and range nav stream
// first, every card shows as soon as its data is in, and a failure stays in its card.
// Sections are keyed by the query inputs, so a range or OS change mounts fresh
// boundaries that show their fallbacks instead of holding the navigation.

function renderGrowthTab({ range, days }: DashboardTabInput): ReactNode {
  const signupRetention = startSignupRetentionLoad(range);
  return (
    <section className="mt-6">
      <h2 className="mb-1 text-sm font-semibold text-slate-600">가입자 · 리텐션</h2>
      <p className="mb-2 break-words text-xs text-slate-500">
        Dn 리텐션은 가입한 날로부터 n일째 되는 날 메시지·글 조회·좋아요·댓글·글쓰기·팔로우 중 하나라도 한 사람의 비율입니다. 그날이 다 지난 가입자만 셉니다. 플랫폼 필터는 적용되지 않습니다.
      </p>
      <Suspense key={`retention:${days}`} fallback={<RetentionSectionFallback />}>
        <RetentionSection dashboardPromise={signupRetention} />
      </Suspense>
    </section>
  );
}

function renderUsageTab({ range, days, platform, forceRefresh }: DashboardTabInput): ReactNode {
  // Only the cache table read is awaited before the cards render; the days it does not
  // have stream into the cards afterwards.
  const usageMetrics = startUsageMetricsLoad(range, { forceRefresh, platform });
  return (
    <Suspense key={`usage:${days}:${platform}`} fallback={<UsageMetricsSectionFallback dayKeys={range.dayKeys} />}>
      <UsageMetricsSection loadPromise={usageMetrics} dayKeys={range.dayKeys} />
    </Suspense>
  );
}

function renderModelsTab({ range, days, platform }: DashboardTabInput): ReactNode {
  const translationModelSeries = startTranslationModelSeriesLoad(range, platform);
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-sm font-semibold text-slate-600">번역 모델별 추이</h2>
      <Suspense key={`${days}:${platform}`} fallback={<TranslationModelSectionFallback />}>
        <TranslationModelSection seriesPromise={translationModelSeries} dayKeys={range.dayKeys} />
      </Suspense>
    </section>
  );
}

function renderSnsTab({ range, days }: DashboardTabInput): ReactNode {
  const snsQueries = startSnsDashboardLoad(range);
  return (
    <section className="mt-6">
      <h2 className="mb-1 text-sm font-semibold text-slate-600">SNS 지표</h2>
      <p className="mb-2 break-words text-xs text-slate-500">
        실사용자가 한 행동만 셉니다(운영 계정 글에 한 반응 포함). 플랫폼 필터는 적용되지 않고, 캐시 없이 매번 새로 집계합니다.
      </p>
      <SnsSection key={`sns:${days}`} queries={snsQueries} dayKeys={range.dayKeys} />
    </section>
  );
}

function renderOperatorsTab({ range, days }: DashboardTabInput): ReactNode {
  const operatorPostStats = startOperatorPostStatsLoad(range);
  return (
    <section className="mt-6">
      <h2 className="mb-1 text-sm font-semibold text-slate-600">운영 계정 글 성과</h2>
      <p className="mb-2 break-words text-xs text-slate-500">
        기간 안에 올라간 운영 계정 글입니다. 실사용자만 세고(운영·공식·직원 계정과 글쓴이 제외), %는 조회 대비입니다. 팔로우·첫 메시지는 그 글에서 했거나, 하기 전 24시간 안에 마지막으로 본 그 계정 글로 셉니다. 플랫폼 필터는 적용되지 않습니다.
      </p>
      <OperatorPostStatsSection key={`operator-posts:${days}`} load={operatorPostStats} />
    </section>
  );
}

/** Keyed by tab, so a new tab without its renderer is a type error. Only the active tab's
 * renderer runs, so a request starts only that tab's queries. */
const DASHBOARD_TAB_RENDERERS: Record<AdminDashboardTab, (input: DashboardTabInput) => ReactNode> = {
  growth: renderGrowthTab,
  usage: renderUsageTab,
  models: renderModelsTab,
  sns: renderSnsTab,
  operators: renderOperatorsTab,
};

export default async function AdminDashboardPage({ searchParams }: DashboardPageProps) {
  const params = await searchParams;
  const tab = normalizeDashboardTab(takeFirst(params.tab));
  const days = normalizeDashboardDays(takeFirst(params.days));
  const platform = normalizeDashboardPlatform(takeFirst(params.platform));
  await requireAdmin(buildAdminDashboardHref({ tab, days, platform }));

  const forceRefresh = takeFirst(params.refresh) === "true" || takeFirst(params.refresh) === "1";
  const range = resolveAdminDashboardRange(new Date(), days);
  const tabContent = DASHBOARD_TAB_RENDERERS[tab]({ range, days, platform, forceRefresh });

  return (
    <AdminPage wide>
      <AdminPageHeader
        back={{ href: "/admin/more", label: "더보기" }}
        description="날짜는 UTC 기준입니다. 운영 계정의 활동은 지표에 넣지 않습니다."
        title="대시보드"
      />

      <DashboardTabNav activeTab={tab} days={days} platform={platform} />

      <RangeNav
        presetOptions={ADMIN_DASHBOARD_PRESET_OPTIONS}
        activeTab={tab}
        activeDays={days}
        activePlatform={platform}
      />

      {tabContent}
    </AdminPage>
  );
}

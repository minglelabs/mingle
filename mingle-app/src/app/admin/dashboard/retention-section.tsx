import {
  ADMIN_DASHBOARD_CHART_HEIGHT,
  ADMIN_DASHBOARD_CHART_WIDTH,
  type AdminDashboardDateRange,
  buildChartGeometry,
  formatShortDay,
  formatSharePercent,
} from "@/lib/admin-dashboard-metrics";
import {
  loadSignupRetention,
  RETENTION_DAYS,
  type RetentionRate,
  type SignupRetentionDashboard,
} from "@/lib/admin-dashboard-retention";
import { DashboardSpinner } from "./dashboard-spinner";
import { LineChartCard, LineChartCardPlaceholder } from "./line-chart-card";
import { StatTile, StatTilePlaceholder } from "./stat-tile";

/** emerald-600: sets signups apart from the sky usage and violet SNS charts. */
const SIGNUP_CHART_COLOR = "#059669";

/** Starts the live query without awaiting it; see startSnsDashboardLoad. */
export function startSignupRetentionLoad(range: AdminDashboardDateRange): Promise<SignupRetentionDashboard> {
  const todayKey = range.dayKeys[range.dayKeys.length - 1] ?? "";
  const dashboard = loadSignupRetention(range, todayKey);
  dashboard.catch(() => undefined);
  return dashboard;
}

function formatCount(value: number): string {
  return value.toLocaleString("ko-KR");
}

export function formatRetention(rate: RetentionRate): string {
  return rate.eligible > 0 ? formatSharePercent(rate.retained / rate.eligible) : "-";
}

const TOTAL_SIGNUPS_LABEL = "누적 가입자";
const TOTAL_SIGNUPS_NOTE = "첫 가입부터 지금까지";
const RANGE_SIGNUPS_LABEL = "기간 신규 가입";

function RetentionCohortTableHead() {
  return (
    <thead className="bg-slate-50 text-xs text-slate-500">
      <tr>
        <th className="px-3 py-2 text-left font-medium">가입 주 (월요일 시작)</th>
        <th className="px-3 py-2 text-right font-medium">가입</th>
        {RETENTION_DAYS.map((n) => <th key={n} className="px-3 py-2 text-right font-medium">D{n}</th>)}
      </tr>
    </thead>
  );
}

export function RetentionCohortTable({ dashboard }: { dashboard: SignupRetentionDashboard }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full min-w-[420px] text-sm">
        <RetentionCohortTableHead />
        <tbody className="divide-y divide-slate-100 tabular-nums">
          {dashboard.cohorts.map((cohort) => (
            <tr key={cohort.weekStart}>
              <td className="px-3 py-2 text-slate-700">{`${formatShortDay(cohort.weekStart)} 주`}</td>
              <td className="px-3 py-2 text-right text-slate-900">{formatCount(cohort.signups)}</td>
              {RETENTION_DAYS.map((n) => {
                const rate = cohort.rates[n];
                return (
                  <td key={n} className="px-3 py-2 text-right text-slate-900">
                    {formatRetention(rate)}
                    {rate.eligible > 0 ? <span className="ml-1 text-xs text-slate-400">{`${rate.retained}/${rate.eligible}`}</span> : null}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {dashboard.cohorts.length === 0 ? <p className="px-3 py-4 text-center text-sm text-slate-500">최근 가입자가 없습니다.</p> : null}
    </div>
  );
}

/** Own Suspense boundary and contained failure, like SnsSection. */
export async function RetentionSection({ dashboardPromise }: { dashboardPromise: Promise<SignupRetentionDashboard> }) {
  let dashboard: SignupRetentionDashboard | null = null;
  try {
    dashboard = await dashboardPromise;
  } catch (error) {
    console.error("[admin-dashboard] retention_failed", error);
  }
  if (!dashboard) {
    return (
      <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm font-medium text-rose-700">
        가입·리텐션 지표를 불러오지 못했습니다.
      </p>
    );
  }
  const geometry = buildChartGeometry(dashboard.cumulativePoints, ADMIN_DASHBOARD_CHART_WIDTH, ADMIN_DASHBOARD_CHART_HEIGHT);
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label={TOTAL_SIGNUPS_LABEL} value={`${formatCount(dashboard.totalSignups)}명`} note={TOTAL_SIGNUPS_NOTE} />
        <StatTile label={RANGE_SIGNUPS_LABEL} value={`${formatCount(dashboard.rangeSignups)}명`} />
        {RETENTION_DAYS.map((n) => (
          <StatTile
            key={n}
            label={`D${n} 리텐션`}
            value={formatRetention(dashboard.overall[n])}
            note={`전체 ${dashboard.overall[n].retained}/${dashboard.overall[n].eligible}명`}
          />
        ))}
      </dl>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <LineChartCard
          label={TOTAL_SIGNUPS_LABEL}
          kind="count"
          ariaLabel="누적 가입자 추이"
          points={geometry.points}
          linePath={geometry.linePath}
          areaPath={geometry.areaPath}
          yMax={geometry.yMax}
          color={SIGNUP_CHART_COLOR}
          footer={`지금까지 ${formatCount(dashboard.totalSignups)}명`}
        />
        <RetentionCohortTable dashboard={dashboard} />
      </div>
    </div>
  );
}

/**
 * Every card of the section comes from one query, so they share one boundary; while it
 * runs, each card's own frame stands in for it.
 */
export function RetentionSectionFallback() {
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTilePlaceholder label={TOTAL_SIGNUPS_LABEL} note={TOTAL_SIGNUPS_NOTE} />
        <StatTilePlaceholder label={RANGE_SIGNUPS_LABEL} />
        {RETENTION_DAYS.map((n) => <StatTilePlaceholder key={n} label={`D${n} 리텐션`} note="" />)}
      </dl>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <LineChartCardPlaceholder label={TOTAL_SIGNUPS_LABEL} status="loading" message="가입·리텐션 지표를 불러오는 중..." />
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[420px] text-sm">
            <RetentionCohortTableHead />
          </table>
          <p role="status" className="flex items-center justify-center gap-1.5 px-3 py-4 text-sm text-slate-500">
            <DashboardSpinner />
            불러오는 중...
          </p>
        </div>
      </div>
    </div>
  );
}

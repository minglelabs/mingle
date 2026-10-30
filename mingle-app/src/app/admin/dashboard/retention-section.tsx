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
import { LineChartCard } from "./line-chart-card";

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

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <dt className="break-words text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{value}</dd>
      {note ? <p className="mt-0.5 break-words text-xs text-slate-500">{note}</p> : null}
    </div>
  );
}

export function RetentionCohortTable({ dashboard }: { dashboard: SignupRetentionDashboard }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full min-w-[420px] text-sm">
        <thead className="bg-slate-50 text-xs text-slate-500">
          <tr>
            <th className="px-3 py-2 text-left font-medium">가입 주 (월요일 시작)</th>
            <th className="px-3 py-2 text-right font-medium">가입</th>
            {RETENTION_DAYS.map((n) => <th key={n} className="px-3 py-2 text-right font-medium">D{n}</th>)}
          </tr>
        </thead>
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
        <Tile label="누적 가입자" value={`${formatCount(dashboard.totalSignups)}명`} note="첫 가입부터 지금까지" />
        <Tile label="기간 신규 가입" value={`${formatCount(dashboard.rangeSignups)}명`} />
        {RETENTION_DAYS.map((n) => (
          <Tile
            key={n}
            label={`D${n} 리텐션`}
            value={formatRetention(dashboard.overall[n])}
            note={`전체 ${dashboard.overall[n].retained}/${dashboard.overall[n].eligible}명`}
          />
        ))}
      </dl>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <LineChartCard
          label="누적 가입자"
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

export function RetentionSectionFallback() {
  return (
    <p role="status" className="rounded-xl border border-slate-200 bg-white px-3 py-6 text-center text-sm text-slate-500">
      가입·리텐션 지표를 불러오는 중...
    </p>
  );
}

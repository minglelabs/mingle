import type { AdminDashboardDateRange } from "@/lib/admin-dashboard-metrics";
import {
  OPERATOR_POST_STAT_KEYS,
  conversionRate,
  formatConversionRate,
  formatStatCount,
} from "@/lib/operator-post-stats";
import {
  OPERATOR_POST_DASHBOARD_ROW_LIMIT,
  loadOperatorPostStatsDashboard,
  type OperatorPostStatsDashboard,
} from "@/server/operator-post-stats/load";
import { OPERATOR_POST_STAT_LABELS } from "../_components/operator-post-stats-row";
import { OperatorPostStatsTable } from "./operator-post-stats-table";

/** Starts the live query without awaiting it; see startSnsDashboardLoad. */
export function startOperatorPostStatsLoad(range: AdminDashboardDateRange): Promise<OperatorPostStatsDashboard> {
  const dashboard = loadOperatorPostStatsDashboard(range);
  dashboard.catch(() => undefined);
  return dashboard;
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

/** Totals over every operator post of the range; each rate is the summed count over the summed views. */
export function OperatorPostStatsTotals({ dashboard }: { dashboard: OperatorPostStatsDashboard }) {
  const { totals } = dashboard;
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
      <Tile label="운영 계정 글" value={`${formatStatCount(dashboard.postCount)}개`} />
      {OPERATOR_POST_STAT_KEYS.map((key) => (
        <Tile
          key={key}
          label={OPERATOR_POST_STAT_LABELS[key]}
          value={formatStatCount(totals[key])}
          note={key === "views" ? "글별 본 사람 합" : `조회 대비 ${formatConversionRate(conversionRate(totals[key], totals.views))}`}
        />
      ))}
    </dl>
  );
}

/** Own Suspense boundary and contained failure, like SnsSection. */
export async function OperatorPostStatsSection({ dashboardPromise }: { dashboardPromise: Promise<OperatorPostStatsDashboard> }) {
  let dashboard: OperatorPostStatsDashboard | null = null;
  try {
    dashboard = await dashboardPromise;
  } catch (error) {
    console.error("[admin-dashboard] operator_post_stats_failed", error);
  }
  if (!dashboard) {
    return (
      <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm font-medium text-rose-700">
        운영 계정 글 성과를 불러오지 못했습니다.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <OperatorPostStatsTotals dashboard={dashboard} />
      {dashboard.postCount > dashboard.rows.length ? (
        <p className="text-xs text-slate-500">
          {`조회가 많은 ${formatStatCount(OPERATOR_POST_DASHBOARD_ROW_LIMIT)}개만 표에 보입니다. 합계는 ${formatStatCount(dashboard.postCount)}개 전체 기준입니다.`}
        </p>
      ) : null}
      <OperatorPostStatsTable rows={dashboard.rows} />
    </div>
  );
}

export function OperatorPostStatsSectionFallback() {
  return (
    <p role="status" className="rounded-xl border border-slate-200 bg-white px-3 py-6 text-center text-sm text-slate-500">
      운영 계정 글 성과를 불러오는 중...
    </p>
  );
}

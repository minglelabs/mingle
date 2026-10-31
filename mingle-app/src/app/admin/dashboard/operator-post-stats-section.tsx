import { Suspense } from "react";
import type { AdminDashboardDateRange } from "@/lib/admin-dashboard-metrics";
import {
  OPERATOR_POST_STAT_KEYS,
  conversionRate,
  formatConversionRate,
  formatStatCount,
  type OperatorPostStatKey,
  type OperatorPostStats,
} from "@/lib/operator-post-stats";
import {
  OPERATOR_POST_COUNT_STAT_KEYS,
  OPERATOR_POST_DASHBOARD_ROW_LIMIT,
  startOperatorPostStatsDashboardLoad,
  type OperatorPostStatsDashboard,
  type OperatorPostStatsDashboardLoad,
} from "@/server/operator-post-stats/load";
import { OPERATOR_POST_STAT_LABELS } from "../_components/operator-post-stats-row";
import { DashboardSpinner } from "./dashboard-spinner";
import { OperatorPostStatsTable } from "./operator-post-stats-table";
import { StatTile, StatTilePlaceholder } from "./stat-tile";

/**
 * Starts the live queries without awaiting them; see startSnsDashboardLoad. Any failure
 * reaches the table's promise, so it is logged once, there.
 */
export function startOperatorPostStatsLoad(range: AdminDashboardDateRange): OperatorPostStatsDashboardLoad {
  const load = startOperatorPostStatsDashboardLoad(range);
  load.dashboard.catch((error: unknown) => console.error("[admin-dashboard] operator_post_stats_failed", error));
  return load;
}

const POST_COUNT_LABEL = "운영 계정 글";
const VIEWS_NOTE = "글별 본 사람 합";

/** The tiles that need only the counts query; follows and messages wait for the attribution query too. */
function isCountStat(key: OperatorPostStatKey): boolean {
  return (OPERATOR_POST_COUNT_STAT_KEYS as readonly OperatorPostStatKey[]).includes(key);
}

/** The post count, once the counts query is done. */
export async function OperatorPostCountTile({ totalsPromise }: { totalsPromise: Promise<{ postCount: number }> }) {
  let postCount: number;
  try {
    ({ postCount } = await totalsPromise);
  } catch {
    return <StatTilePlaceholder label={POST_COUNT_LABEL} status="error" />;
  }
  return <StatTile label={POST_COUNT_LABEL} value={`${formatStatCount(postCount)}개`} />;
}

/** One stat summed over the range's posts, with its share of the summed views. */
export async function OperatorPostStatTile({
  statKey,
  totalsPromise,
}: {
  statKey: OperatorPostStatKey;
  totalsPromise: Promise<{ totals: Pick<OperatorPostStats, "views"> & Partial<OperatorPostStats> }>;
}) {
  const label = OPERATOR_POST_STAT_LABELS[statKey];
  let value: number | undefined;
  let views = 0;
  try {
    const { totals } = await totalsPromise;
    value = totals[statKey];
    views = totals.views;
  } catch {
    // Logged by startOperatorPostStatsLoad.
  }
  if (value === undefined) return <StatTilePlaceholder label={label} status="error" />;
  return (
    <StatTile
      label={label}
      value={formatStatCount(value)}
      note={statKey === "views" ? VIEWS_NOTE : `조회 대비 ${formatConversionRate(conversionRate(value, views))}`}
    />
  );
}

/** The table and its note, once both queries and the posts' details are in. */
export async function OperatorPostStatsTableCard({ dashboardPromise }: { dashboardPromise: Promise<OperatorPostStatsDashboard> }) {
  let dashboard: OperatorPostStatsDashboard | null = null;
  try {
    dashboard = await dashboardPromise;
  } catch {
    // Logged by startOperatorPostStatsLoad.
  }
  if (!dashboard) {
    return (
      <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm font-medium text-rose-700">
        운영 계정 글 성과를 불러오지 못했습니다.
      </p>
    );
  }
  return (
    <>
      {dashboard.postCount > dashboard.rows.length ? (
        <p className="text-xs text-slate-500">
          {`조회가 많은 ${formatStatCount(OPERATOR_POST_DASHBOARD_ROW_LIMIT)}개만 표에 보입니다. 합계는 ${formatStatCount(dashboard.postCount)}개 전체 기준입니다.`}
        </p>
      ) : null}
      <OperatorPostStatsTable rows={dashboard.rows} />
    </>
  );
}

/**
 * Totals over every operator post of the range (each rate is the summed count over the
 * summed views), then the table. Every tile and the table have their own Suspense
 * boundary: the count tiles show once the counts query is done, follows and messages
 * once the attribution query is too, and a failure stays in its card.
 */
export function OperatorPostStatsSection({ load }: { load: OperatorPostStatsDashboardLoad }) {
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <Suspense fallback={<StatTilePlaceholder label={POST_COUNT_LABEL} />}>
          <OperatorPostCountTile totalsPromise={load.countTotals} />
        </Suspense>
        {OPERATOR_POST_STAT_KEYS.map((key) => (
          <Suspense
            key={key}
            fallback={<StatTilePlaceholder label={OPERATOR_POST_STAT_LABELS[key]} note={key === "views" ? VIEWS_NOTE : ""} />}
          >
            <OperatorPostStatTile statKey={key} totalsPromise={isCountStat(key) ? load.countTotals : load.totals} />
          </Suspense>
        ))}
      </dl>
      <Suspense fallback={<OperatorPostStatsSectionFallback />}>
        <OperatorPostStatsTableCard dashboardPromise={load.dashboard} />
      </Suspense>
    </div>
  );
}

/** The table's Suspense fallback. */
export function OperatorPostStatsSectionFallback() {
  return (
    <p role="status" className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-6 text-center text-sm text-slate-500">
      <DashboardSpinner />
      운영 계정 글 성과를 불러오는 중...
    </p>
  );
}

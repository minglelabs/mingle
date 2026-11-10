import type { AdminDashboardDateRange } from "@/lib/admin-dashboard-metrics";
import {
  startAdminDashboardMetricsLoad,
  type AdminDashboardMetricsLoad,
  type LoadAdminDashboardOptions,
} from "@/lib/admin-dashboard-query";
import { UsageMetricsFallbackView, UsageMetricsView } from "./usage-metrics-view";

/**
 * Starts the load without awaiting it; see startSnsDashboardLoad. It resolves after the
 * cache table read, with the days still to compute as parts that are already running.
 */
export function startUsageMetricsLoad(
  range: AdminDashboardDateRange,
  options: LoadAdminDashboardOptions,
): Promise<AdminDashboardMetricsLoad> {
  const load = startAdminDashboardMetricsLoad(range, options);
  load.catch(() => undefined);
  return load;
}

/**
 * The 사용량·성능 cards, under their own Suspense boundary. Waits only for the cache table
 * read, then hands the cached days and the running parts to the view, so no card waits
 * for the slowest query. A failed cache read is contained here: the route has no error
 * boundary.
 */
export async function UsageMetricsSection({
  loadPromise,
  dayKeys,
}: {
  loadPromise: Promise<AdminDashboardMetricsLoad>;
  dayKeys: string[];
}) {
  let load: AdminDashboardMetricsLoad | null = null;
  try {
    load = await loadPromise;
  } catch (error) {
    console.error("[admin-dashboard] usage_metrics_failed", error);
  }
  if (!load) {
    return (
      <p role="alert" className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm font-medium text-rose-700">
        사용량·성능 지표를 불러오지 못했습니다.
      </p>
    );
  }
  return <UsageMetricsView dayKeys={dayKeys} cached={load.cached} parts={load.parts} />;
}

export function UsageMetricsSectionFallback({ dayKeys }: { dayKeys: string[] }) {
  return <UsageMetricsFallbackView dayKeys={dayKeys} />;
}

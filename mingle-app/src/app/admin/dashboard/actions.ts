"use server";

import { revalidatePath } from "next/cache";
import {
  ADMIN_DASHBOARD_MAX_DAYS,
  ADMIN_DASHBOARD_TIME_ZONE,
  buildAdminDashboardHref,
  normalizeDashboardPlatform,
  normalizeDashboardTab,
  resolveAdminDashboardRange,
  resolveUncacheableDayKeys,
  type AdminDashboardPlatform,
  type AdminDashboardTab,
} from "@/lib/admin-dashboard-metrics";
import { clearAdminDashboardCache } from "@/lib/admin-dashboard-query";
import { requireAdmin } from "@/server/admin/guard";

export async function clearDashboardCacheAction(
  days: number,
  platform: AdminDashboardPlatform = "all",
  tab: AdminDashboardTab = "usage",
): Promise<{ success: boolean; error?: string }> {
  const safeDays = Math.min(ADMIN_DASHBOARD_MAX_DAYS, Math.max(1, Math.round(Number(days) || 30)));
  const safePlatform = normalizeDashboardPlatform(platform);
  // After a fresh login, back to the same tab, range and OS.
  await requireAdmin(buildAdminDashboardHref({ tab: normalizeDashboardTab(tab), days: safeDays, platform: safePlatform }));

  try {
    const now = new Date();
    const range = resolveAdminDashboardRange(now, safeDays);
    const uncacheableKeys = resolveUncacheableDayKeys(now, ADMIN_DASHBOARD_TIME_ZONE);
    // 현재 윈도우에서 오늘·어제를 제외한 날짜의 캐시만 삭제
    const cacheableDayKeys = range.dayKeys.filter((dayKey) => !uncacheableKeys.has(dayKey));

    await clearAdminDashboardCache(cacheableDayKeys, safePlatform);
    revalidatePath("/admin/dashboard");
    return { success: true };
  } catch (error) {
    console.error("Failed to clear admin dashboard cache", error);
    return { success: false, error: "대시보드 캐시 초기화 중 오류가 발생했습니다." };
  }
}

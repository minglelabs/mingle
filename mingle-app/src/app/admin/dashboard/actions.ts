"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ADMIN_SESSION_COOKIE_NAME, verifyAdminSessionToken } from "@/lib/admin-auth";
import {
  ADMIN_DASHBOARD_MAX_DAYS,
  ADMIN_DASHBOARD_TIME_ZONE,
  normalizeDashboardPlatform,
  resolveAdminDashboardRange,
  resolveUncacheableDayKeys,
  type AdminDashboardPlatform,
} from "@/lib/admin-dashboard-metrics";
import { clearAdminDashboardCache } from "@/lib/admin-dashboard-query";

export async function clearDashboardCacheAction(
  days: number,
  platform: AdminDashboardPlatform = "all",
): Promise<{ success: boolean; error?: string }> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  const isAuthenticated = verifyAdminSessionToken(token);

  if (!isAuthenticated) {
    return { success: false, error: "관리자 인증이 필요합니다." };
  }

  const safeDays = Math.min(ADMIN_DASHBOARD_MAX_DAYS, Math.max(1, Math.round(Number(days) || 30)));
  const safePlatform = normalizeDashboardPlatform(platform);

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

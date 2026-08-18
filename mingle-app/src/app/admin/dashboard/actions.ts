"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ADMIN_SESSION_COOKIE_NAME, verifyAdminSessionToken } from "@/lib/admin-auth";
import { clearAdminDashboardCache } from "@/lib/admin-dashboard-query";

export async function clearDashboardCacheAction(): Promise<{ success: boolean; error?: string }> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  const isAuthenticated = verifyAdminSessionToken(token);

  if (!isAuthenticated) {
    return { success: false, error: "관리자 인증이 필요합니다." };
  }

  try {
    await clearAdminDashboardCache();
    revalidatePath("/admin/dashboard");
    return { success: true };
  } catch (error) {
    console.error("Failed to clear admin dashboard cache", error);
    return { success: false, error: "대시보드 캐시 초기화 중 오류가 발생했습니다." };
  }
}

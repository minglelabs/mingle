export type AdminTabKey = "inbox" | "activity" | "review" | "feed" | "operators" | "waitlist" | "references" | "reports" | "feedback" | "dashboard" | "more";

/** Optional count per tab (e.g. unread inbox rooms). 0 / undefined shows nothing. */
export type AdminTabBadges = Partial<Record<AdminTabKey, number>>;

export type AdminTabDefinition = { key: AdminTabKey; href: string; label: string };

/** Bottom tabs of the admin shell, in display order. */
export const ADMIN_TABS: readonly AdminTabDefinition[] = [
  { key: "inbox", href: "/admin/inbox", label: "인박스" },
  { key: "activity", href: "/admin/activity", label: "알림" },
  { key: "review", href: "/admin/operators/review", label: "검토" },
  { key: "feed", href: "/admin/feed", label: "피드" },
  { key: "operators", href: "/admin/operators", label: "계정" },
  { key: "waitlist", href: "/admin/waitlist", label: "대기열" },
  { key: "references", href: "/admin/operators/references", label: "레퍼런스" },
  { key: "reports", href: "/admin/reports", label: "신고/이상유저검수" },
  { key: "feedback", href: "/admin", label: "피드백" },
  { key: "dashboard", href: "/admin/dashboard", label: "대시보드" },
  { key: "more", href: "/admin/more", label: "더보기" },
];

function isUnder(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The current tab, by the longest matching href (검토 and 레퍼런스 sit under 계정's path).
 * 피드백 is `/admin` itself only (every screen sits under that path). Every other
 * admin screen (게시물, 대화록, 알림 설정, 더보기 itself) is reached from 더보기,
 * so that tab is current there.
 */
export function resolveActiveAdminTab(pathname: string): AdminTabKey {
  let best: AdminTabDefinition | null = null;
  for (const tab of ADMIN_TABS) {
    if (tab.key === "more") continue;
    if (tab.key === "feedback" ? pathname !== tab.href : !isUnder(pathname, tab.href)) continue;
    if (!best || tab.href.length > best.href.length) best = tab;
  }
  return best?.key ?? "more";
}

/** A tab badge count, or 0 when there is nothing to show. */
export function normalizeAdminTabBadge(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/** Badge text: the count, capped at "99+". */
export function formatAdminTabBadge(count: number): string {
  return count > 99 ? "99+" : String(count);
}

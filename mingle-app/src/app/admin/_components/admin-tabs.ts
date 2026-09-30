export type AdminTabKey = "inbox" | "operators" | "posts" | "more";

/** Optional count per tab (e.g. unread inbox rooms). 0 / undefined shows nothing. */
export type AdminTabBadges = Partial<Record<AdminTabKey, number>>;

export type AdminTabDefinition = { key: AdminTabKey; href: string; label: string };

/** Bottom tabs of the admin shell, in display order. */
export const ADMIN_TABS: readonly AdminTabDefinition[] = [
  { key: "inbox", href: "/admin/inbox", label: "인박스" },
  { key: "operators", href: "/admin/operators", label: "계정" },
  { key: "posts", href: "/admin/posts", label: "게시물" },
  { key: "more", href: "/admin/more", label: "더보기" },
];

function isUnder(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The current tab. Every admin screen that is not under 인박스 / 계정 / 게시물
 * (피드백 `/admin`, 신고함, 대시보드, 대화록, 알림 설정, 더보기 itself) is
 * reached from 더보기, so that tab is current there.
 */
export function resolveActiveAdminTab(pathname: string): AdminTabKey {
  for (const tab of ADMIN_TABS) {
    if (tab.key !== "more" && isUnder(pathname, tab.href)) return tab.key;
  }
  return "more";
}

/** A tab badge count, or 0 when there is nothing to show. */
export function normalizeAdminTabBadge(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/** Badge text: the count, capped at "99+". */
export function formatAdminTabBadge(count: number): string {
  return count > 99 ? "99+" : String(count);
}

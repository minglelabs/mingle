"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Ellipsis, Inbox, Newspaper, UsersRound, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ADMIN_TABS,
  formatAdminTabBadge,
  normalizeAdminTabBadge,
  resolveActiveAdminTab,
  type AdminTabBadges,
  type AdminTabDefinition,
  type AdminTabKey,
} from "./admin-tabs";

const TAB_ICONS: Record<AdminTabKey, LucideIcon> = {
  inbox: Inbox,
  operators: UsersRound,
  posts: Newspaper,
  more: Ellipsis,
};

/** Bottom tab bar: 인박스 · 계정 · 게시물 · 더보기, each with an optional count badge. */
export function AdminTabBar({ badges }: { badges?: AdminTabBadges }) {
  const pathname = usePathname() ?? "/admin";
  const active = resolveActiveAdminTab(pathname);
  const [unreadTotal, setUnreadTotal] = useState(0);

  useEffect(() => {
    let disposed = false;
    let inFlight = false;
    const controller = new AbortController();
    async function refreshUnread() {
      if (disposed || inFlight || document.visibilityState === "hidden") return;
      inFlight = true;
      try {
        const response = await fetch("/admin/inbox/api/summary", {
          cache: "no-store", signal: controller.signal,
        });
        if (response.status === 401) {
          if (!disposed) setUnreadTotal(0);
          return;
        }
        if (!response.ok) return;
        const summary: { unreadTotal?: unknown } = await response.json();
        if (!disposed) setUnreadTotal(normalizeAdminTabBadge(summary.unreadTotal));
      } catch {
        // Keep the last count during a temporary network failure.
      } finally {
        inFlight = false;
      }
    }
    void refreshUnread();
    const onRefresh = () => { void refreshUnread(); };
    const timer = window.setInterval(onRefresh, 20_000);
    window.addEventListener("focus", onRefresh);
    window.addEventListener("mingle:admin-inbox-updated", onRefresh);
    document.addEventListener("visibilitychange", onRefresh);
    return () => {
      disposed = true;
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", onRefresh);
      window.removeEventListener("mingle:admin-inbox-updated", onRefresh);
      document.removeEventListener("visibilitychange", onRefresh);
    };
  }, [pathname]);

  return (
    <nav
      aria-label="관리자 메뉴"
      className="shrink-0 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] backdrop-blur"
    >
      <ul className="mx-auto grid w-full max-w-lg grid-cols-4">
        {ADMIN_TABS.map((tab) => (
          <li key={tab.key}>
            <AdminTabLink tab={tab} active={tab.key === active} badge={badges?.[tab.key] ?? (tab.key === "inbox" ? unreadTotal : undefined)} />
          </li>
        ))}
      </ul>
    </nav>
  );
}

function AdminTabLink({ tab, active, badge }: { tab: AdminTabDefinition; active: boolean; badge?: number }) {
  const Icon = TAB_ICONS[tab.key];
  const count = normalizeAdminTabBadge(badge);
  return (
    <Link
      aria-current={active ? "page" : undefined}
      aria-label={count > 0 ? `${tab.label}, 새 항목 ${count}개` : undefined}
      className={cn(
        "flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-xs font-semibold transition",
        "focus-visible:bg-slate-50 focus-visible:outline-none",
        active ? "text-sky-700" : "text-slate-500 hover:text-slate-800",
      )}
      href={tab.href}
    >
      <span className="relative">
        <Icon className="h-6 w-6" strokeWidth={active ? 2.4 : 1.9} aria-hidden="true" />
        {count > 0 ? (
          <span
            aria-hidden="true"
            className="absolute -right-2.5 -top-1.5 min-w-[1.125rem] rounded-full bg-rose-500 px-1 text-center text-[11px] font-bold leading-[1.125rem] text-white ring-2 ring-white"
          >
            {formatAdminTabBadge(count)}
          </span>
        ) : null}
      </span>
      <span>{tab.label}</span>
    </Link>
  );
}

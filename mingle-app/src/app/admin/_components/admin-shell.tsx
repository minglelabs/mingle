import type { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import { AdminTabBar } from "./admin-tab-bar";
import type { AdminTabBadges } from "./admin-tabs";
import { ADMIN_SCROLL_CONTAINER_ID } from "./ui";

/**
 * Frame for every admin screen: a slim top bar, one scroll area and (signed
 * in only) the navigation: a bottom tab bar on a phone, a left rail from `lg`
 * up. Presentation only; each page and
 * action still runs `requireAdmin` itself. Safe-area insets pad the bars, so
 * nothing sits under the iOS status bar or home indicator.
 */
export function AdminShell({
  signedIn,
  badges,
  children,
}: {
  signedIn: boolean;
  badges?: AdminTabBadges;
  children: ReactNode;
}) {
  return (
    <div className="flex h-svh w-full flex-col bg-slate-50 text-slate-900">
      <header className="shrink-0 border-b border-slate-200 bg-white pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-12 w-full max-w-6xl items-center gap-2 px-4 sm:px-6">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-sky-100 text-sky-700">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-slate-900">Mingle Admin</span>
        </div>
      </header>
      <div className="flex min-h-0 w-full flex-1 flex-col lg:flex-row">
        <main
          className="min-h-0 w-full min-w-0 flex-1 overflow-y-auto overscroll-contain pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]"
          id={ADMIN_SCROLL_CONTAINER_ID}
        >
          {children}
        </main>
        {signedIn ? <AdminTabBar badges={badges} /> : null}
      </div>
    </div>
  );
}

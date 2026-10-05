"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * List + detail frame for 인박스 and 알림. On a phone it is one column: the
 * list on the index route, the detail everywhere below it. From `lg` up both
 * show side by side (list left, detail right), each with its own scroll, so
 * staff keep the list in view while they read and answer. The list stays
 * mounted across detail navigation, so its filter and scroll position hold.
 */
export function AdminSplitFrame({
  indexPath,
  listLabel,
  list,
  children,
}: {
  /** The list route, e.g. `/admin/inbox`. */
  indexPath: string;
  listLabel: string;
  list: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname() ?? indexPath;
  const onIndex = pathname === indexPath || pathname === `${indexPath}/`;
  return (
    <div className="lg:flex lg:h-full">
      <aside
        aria-label={listLabel}
        className={cn(
          onIndex ? "block" : "hidden",
          "lg:block lg:h-full lg:w-[400px] lg:shrink-0 lg:overflow-y-auto lg:overscroll-contain lg:border-r lg:border-slate-200",
        )}
      >
        {list}
      </aside>
      <section
        className={cn(
          onIndex ? "hidden" : "block",
          "lg:relative lg:block lg:h-full lg:min-w-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain",
        )}
      >
        {children}
      </section>
    </div>
  );
}

/** What the detail pane shows on a wide screen while nothing is selected. */
export function AdminSplitPlaceholder({ children }: { children: ReactNode }) {
  return (
    <div className="hidden h-full items-center justify-center px-6 text-center text-sm text-slate-500 lg:flex">
      {children}
    </div>
  );
}

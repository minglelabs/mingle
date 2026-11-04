"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, type MouseEvent, type ReactNode } from "react";
import { ADMIN_SCROLL_CONTAINER_ID } from "./ui";

/**
 * Screen-by-screen navigation state for the admin.
 *
 * Two things a "back" needs that the admin did not keep:
 * - Going back means going to the screen the reader came from, exactly as it
 *   was (its page in the list), by popping the history, not by pushing the
 *   list's address again (that stacks a copy and the next back lands on the
 *   screen just left).
 * - The page scrolls inside `#admin-scroll`, not the window, so the browser
 *   does not restore its position: each screen's scroll is kept per address
 *   and put back when it is reached by back / forward.
 *
 * Kept in `sessionStorage` (per tab, survives a reload); every read and write
 * is best-effort, and without it a back link simply goes to its own address.
 */

const NAV_KEY = "admin-nav";
const SCROLL_PREFIX = "admin-scroll:";
const SCROLL_RESTORE_FRAMES = 40;

type NavState = { prev: string | null; last: string | null };

function readNav(): NavState {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(NAV_KEY) ?? "null") as Partial<NavState> | null;
    return { prev: typeof parsed?.prev === "string" ? parsed.prev : null, last: typeof parsed?.last === "string" ? parsed.last : null };
  } catch {
    return { prev: null, last: null };
  }
}

function writeNav(state: NavState): void {
  try {
    window.sessionStorage.setItem(NAV_KEY, JSON.stringify(state));
  } catch {
    // Best-effort.
  }
}

function withoutHash(href: string): string {
  const index = href.indexOf("#");
  return index === -1 ? href : href.slice(0, index);
}

function scrollContainer(): HTMLElement | null {
  return document.getElementById(ADMIN_SCROLL_CONTAINER_ID);
}

/** Records the screen the reader is on and keeps its scroll; mounted once in the admin frame. */
export function AdminNavTracker() {
  const pathname = usePathname();
  const search = useSearchParams().toString();

  useEffect(() => {
    const url = `${pathname}${search ? `?${search}` : ""}`;
    const nav = readNav();
    if (nav.last !== url) writeNav({ prev: nav.last, last: url });

    // Back / forward put the screen's own scroll back; a new visit starts at the top.
    let popped = false;
    const onPop = () => { popped = true; };
    window.addEventListener("popstate", onPop);

    let frame = 0;
    let restoreFrame = 0;
    const container = scrollContainer();
    const saved = (() => {
      try { return Number(window.sessionStorage.getItem(`${SCROLL_PREFIX}${url}`)); } catch { return 0; }
    })();
    // The popstate fires before this effect on a back; read the flag a tick later.
    const startRestore = window.setTimeout(() => {
      if (!popped && nav.last === url) popped = true; // a reload keeps its place too
      if (!container || !popped || !saved) return;
      let tries = 0;
      const apply = () => {
        container.scrollTop = saved;
        tries += 1;
        // The list may still be filling in: retry until it is tall enough.
        if (Math.abs(container.scrollTop - saved) > 2 && tries < SCROLL_RESTORE_FRAMES) restoreFrame = requestAnimationFrame(apply);
      };
      restoreFrame = requestAnimationFrame(apply);
    }, 0);

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        try { window.sessionStorage.setItem(`${SCROLL_PREFIX}${url}`, String(container?.scrollTop ?? 0)); } catch { /* Best-effort. */ }
      });
    };
    container?.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      window.clearTimeout(startRestore);
      cancelAnimationFrame(frame);
      cancelAnimationFrame(restoreFrame);
      window.removeEventListener("popstate", onPop);
      container?.removeEventListener("scroll", onScroll);
    };
  }, [pathname, search]);

  return null;
}

/**
 * A back link that returns to the previous screen when `href` is where the
 * reader just was (popping the history, so that screen comes back as it was),
 * and goes to `href` otherwise (opened directly, or from elsewhere).
 */
export function AdminBackLink({
  href,
  className,
  children,
  "aria-label": ariaLabel,
}: {
  href: string;
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
}) {
  const router = useRouter();
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (readNav().prev !== withoutHash(href)) return; // Not where they came from: follow the link.
    event.preventDefault();
    router.back();
  };
  return (
    <Link href={href} onClick={onClick} className={className} aria-label={ariaLabel}>
      {children}
    </Link>
  );
}

"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { ADMIN_SCROLL_CONTAINER_ID } from "./ui";

/** Screens whose list is refreshed by pulling down from the top (staff, 2026-11-25). */
const PULL_REFRESH_PATHS = ["/admin/operators/review", "/admin/feed", "/admin/activity", "/admin/reports", "/admin/operators/references"];
const TRIGGER_PX = 70;
const MAX_PX = 110;

export function pullRefreshEnabled(pathname: string): boolean {
  return PULL_REFRESH_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))
    || /^\/admin\/operators\/[^/]+\/profile$/.test(pathname);
}

/**
 * Pull to refresh on a phone: dragging down while the admin scroll area is at
 * its top shows a spinner and, past the trigger, reloads the page's data
 * (router.refresh) without leaving the page.
 */
export function AdminPullRefresh() {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [pull, setPull] = useState(0);
  const [pending, startTransition] = useTransition();
  const pullRef = useRef(0);
  const enabled = pullRefreshEnabled(pathname);

  useEffect(() => {
    const scroller = document.getElementById(ADMIN_SCROLL_CONTAINER_ID);
    if (!enabled || !scroller) return;
    let startX = 0;
    let startY = 0;
    let tracking = false;
    let pulling = false;
    const set = (value: number) => {
      pullRef.current = value;
      setPull(value);
      scroller.style.transform = value ? `translateY(${value}px)` : "";
    };
    const onStart = (event: TouchEvent) => {
      tracking = event.touches.length === 1 && scroller.scrollTop <= 0;
      pulling = false;
      startX = event.touches[0]?.clientX ?? 0;
      startY = event.touches[0]?.clientY ?? 0;
    };
    const onMove = (event: TouchEvent) => {
      if (!tracking) return;
      const touch = event.touches[0];
      if (!touch) return;
      const dy = touch.clientY - startY;
      const dx = touch.clientX - startX;
      if (!pulling) {
        // Sideways (a photo carousel) or upward: not a pull.
        if (Math.abs(dx) > Math.abs(dy) || dy <= 0 || scroller.scrollTop > 0) {
          if (Math.abs(dx) > 8 || dy < -8) tracking = false;
          return;
        }
        if (dy < 8) return;
        pulling = true;
      }
      event.preventDefault();
      set(Math.min(MAX_PX, Math.max(0, (dy - 8) * 0.5)));
    };
    const onEnd = () => {
      if (pulling && pullRef.current >= TRIGGER_PX) {
        startTransition(() => router.refresh());
      }
      tracking = false;
      pulling = false;
      scroller.style.transition = "transform 200ms ease";
      set(0);
      window.setTimeout(() => { scroller.style.transition = ""; }, 220);
    };
    scroller.addEventListener("touchstart", onStart, { passive: true });
    scroller.addEventListener("touchmove", onMove, { passive: false });
    scroller.addEventListener("touchend", onEnd);
    scroller.addEventListener("touchcancel", onEnd);
    return () => {
      scroller.removeEventListener("touchstart", onStart);
      scroller.removeEventListener("touchmove", onMove);
      scroller.removeEventListener("touchend", onEnd);
      scroller.removeEventListener("touchcancel", onEnd);
      scroller.style.transform = "";
    };
  }, [enabled, router]);

  if (!enabled || (!pull && !pending)) return null;
  const ready = pull >= TRIGGER_PX;
  return (
    <div aria-live="polite" className="pointer-events-none absolute inset-x-0 top-2 z-20 flex justify-center">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow ring-1 ring-slate-200">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" style={{ transform: `rotate(${pull * 3}deg)` }} aria-hidden="true" />}
        {pending ? "새로고침 중" : ready ? "놓으면 새로고침" : "당겨서 새로고침"}
      </span>
    </div>
  );
}

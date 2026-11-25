"use client";

import { useEffect, useRef, useState } from "react";

/** How far the list must be dragged (after resistance) before letting go refreshes. */
export const PULL_REFRESH_TRIGGER_PX = 64;
const PULL_REFRESH_MAX_PX = 96;
const PULL_REFRESH_RESISTANCE = 0.45;
/** The spinner stays at least this long, so a fast answer does not flicker. */
const PULL_REFRESH_MIN_SHOWN_MS = 500;

/** How far the row above the list is open for a finger that moved `dy` px down. */
export function pullDistanceFor(dy: number): number {
  if (!(dy > 0)) return 0;
  return Math.min(PULL_REFRESH_MAX_PX, Math.round(dy * PULL_REFRESH_RESISTANCE));
}

/**
 * Pull to refresh for a scrolling list (owner, 2026-11-25: the explore tab,
 * like the chat list): dragging down while the list is at its top opens a row
 * with a spinner; letting go past the trigger calls `onRefresh`.
 */
export function usePullToRefresh(scrollEl: HTMLElement | null, onRefresh: () => Promise<unknown>, enabled = true) {
  const [distance, setDistance] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const onRefreshRef = useRef(onRefresh);
  const blockedRef = useRef(false);
  useEffect(() => {
    onRefreshRef.current = onRefresh;
    blockedRef.current = !enabled || refreshing;
  }, [enabled, onRefresh, refreshing]);

  useEffect(() => {
    if (!scrollEl) return;
    let startY: number | null = null;
    let startX = 0;
    let pulled = 0;
    const reset = () => {
      startY = null;
      pulled = 0;
      setDragging(false);
      setDistance(0);
    };
    const onStart = (event: TouchEvent) => {
      if (blockedRef.current || scrollEl.scrollTop > 0 || event.touches.length !== 1) {
        startY = null;
        return;
      }
      startY = event.touches[0].clientY;
      startX = event.touches[0].clientX;
      pulled = 0;
    };
    const onMove = (event: TouchEvent) => {
      if (startY === null) return;
      const touch = event.touches[0];
      const dy = touch.clientY - startY;
      // Scrolling the list, or a sideways swipe (the notice strip): not a pull.
      if (scrollEl.scrollTop > 0 || (pulled === 0 && Math.abs(touch.clientX - startX) > Math.abs(dy))) {
        reset();
        return;
      }
      if (dy <= 0) {
        if (pulled > 0) {
          pulled = 0;
          setDistance(0);
        }
        return;
      }
      // The row opens in place of the browser's own overscroll bounce.
      if (event.cancelable) event.preventDefault();
      pulled = pullDistanceFor(dy);
      setDragging(true);
      setDistance(pulled);
    };
    const onEnd = () => {
      if (startY === null) return;
      const reached = pulled >= PULL_REFRESH_TRIGGER_PX;
      reset();
      if (!reached || blockedRef.current) return;
      blockedRef.current = true;
      setRefreshing(true);
      const minimumShown = new Promise((resolve) => window.setTimeout(resolve, PULL_REFRESH_MIN_SHOWN_MS));
      void Promise.all([onRefreshRef.current().catch(() => undefined), minimumShown]).then(() => setRefreshing(false));
    };
    scrollEl.addEventListener("touchstart", onStart, { passive: true });
    scrollEl.addEventListener("touchmove", onMove, { passive: false });
    scrollEl.addEventListener("touchend", onEnd);
    scrollEl.addEventListener("touchcancel", reset);
    return () => {
      scrollEl.removeEventListener("touchstart", onStart);
      scrollEl.removeEventListener("touchmove", onMove);
      scrollEl.removeEventListener("touchend", onEnd);
      scrollEl.removeEventListener("touchcancel", reset);
    };
  }, [scrollEl]);

  const offset = refreshing ? PULL_REFRESH_TRIGGER_PX : distance;
  return {
    /** Height of the row above the list, in px. */
    offset,
    progress: Math.min(1, offset / PULL_REFRESH_TRIGGER_PX),
    dragging,
    refreshing,
  };
}

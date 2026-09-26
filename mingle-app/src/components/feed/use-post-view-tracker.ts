"use client";

import { buildClientApiPath } from "@/lib/api-contract";
import { useCallback, useEffect, useRef } from "react";
import {
  createDwellAccumulator,
  evaluateSeen,
  SEEN_DWELL_MS,
  startInterval,
  stopInterval,
  type DwellAccumulator,
} from "./view-dwell";

type UsePostViewTrackerOptions = {
  /** The id of the post currently full-screen, or null if none/uncertain. */
  activePostId: string | null;
  /** Views are only recorded for signed-in viewers. */
  isSignedIn: boolean;
};

/**
 * Records a "seen" view (`POST /posts/{id}/view`) once a post has been the
 * active, fully-visible, foreground card for ≥ 1s of accumulated time.
 *
 * - Prefetched / off-screen posts never become active, so they never count.
 * - Time while `document.hidden` is excluded (interval paused on
 *   `visibilitychange`).
 * - Flicking past in < 1s leaves the post unseen.
 * - Fires at most once per post; signed-out viewers record nothing.
 */
export function usePostViewTracker(options: UsePostViewTrackerOptions): void {
  const { activePostId, isSignedIn } = options;

  const accumulatorsRef = useRef<Map<string, DwellAccumulator>>(new Map());
  const reportedRef = useRef<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef<string | null>(null);

  const report = useCallback(
    (postId: string) => {
      if (reportedRef.current.has(postId)) return;
      reportedRef.current.add(postId);
      // Fire-and-forget; a failed view record must not disturb the feed.
      void fetch(buildClientApiPath(`/posts/${encodeURIComponent(postId)}/view`), {
        method: "POST",
        cache: "no-store",
        keepalive: true,
      }).catch(() => {});
    },
    [],
  );

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const accFor = useCallback((postId: string): DwellAccumulator => {
    let acc = accumulatorsRef.current.get(postId);
    if (!acc) {
      acc = createDwellAccumulator();
      accumulatorsRef.current.set(postId, acc);
    }
    return acc;
  }, []);

  const scheduleEvaluation = useCallback(
    (postId: string) => {
      clearTimer();
      const acc = accFor(postId);
      if (acc.reported || reportedRef.current.has(postId)) return;
      const remaining = Math.max(0, SEEN_DWELL_MS - (acc.accumulatedMs));
      timerRef.current = setTimeout(() => {
        const current = accFor(postId);
        const { acc: nextAcc, shouldReport } = evaluateSeen(current, Date.now());
        accumulatorsRef.current.set(postId, nextAcc);
        if (shouldReport) report(postId);
      }, remaining + 20);
    },
    [accFor, clearTimer, report],
  );

  const beginActive = useCallback(
    (postId: string) => {
      if (!isSignedIn) return;
      const acc = startInterval(accFor(postId), Date.now());
      accumulatorsRef.current.set(postId, acc);
      scheduleEvaluation(postId);
    },
    [isSignedIn, accFor, scheduleEvaluation],
  );

  const endActive = useCallback(
    (postId: string) => {
      clearTimer();
      const acc = stopInterval(accFor(postId), Date.now());
      const { acc: nextAcc, shouldReport } = evaluateSeen(acc, Date.now());
      accumulatorsRef.current.set(postId, nextAcc);
      if (shouldReport) report(postId);
    },
    [accFor, clearTimer, report],
  );

  // Track the active post transitions.
  useEffect(() => {
    if (!isSignedIn) return;
    const accumulators = accumulatorsRef.current;
    const prev = activeRef.current;
    if (prev && prev !== activePostId) {
      endActive(prev);
    }
    activeRef.current = activePostId;
    if (activePostId) {
      beginActive(activePostId);
    }
    return () => {
      // On unmount / dep change fold the running interval in.
      const running = activeRef.current;
      if (running) {
        const acc = stopInterval(accumulators.get(running) ?? createDwellAccumulator(), Date.now());
        accumulators.set(running, acc);
      }
      clearTimer();
    };
  }, [activePostId, isSignedIn, beginActive, endActive, clearTimer]);

  // Pause counting while the tab / app is backgrounded.
  useEffect(() => {
    if (!isSignedIn) return;
    const onVisibility = () => {
      const active = activeRef.current;
      if (!active) return;
      if (document.hidden) {
        const acc = stopInterval(accFor(active), Date.now());
        accumulatorsRef.current.set(active, acc);
        clearTimer();
      } else {
        beginActive(active);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [isSignedIn, accFor, beginActive, clearTimer]);
}

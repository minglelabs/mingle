"use client";

import { buildClientApiPath } from "@/lib/api-contract";
import { useCallback, useEffect, useRef } from "react";
import {
  checkVisit,
  createVisitState,
  pauseVisit,
  remainingVisitMs,
  resumeVisit,
  setActivePost,
  type VisitState,
  type VisitStep,
} from "./view-dwell";

type UsePostViewTrackerOptions = {
  /** The id of the post currently full-screen, or null if none/uncertain. */
  activePostId: string | null;
  /** Views are only recorded for signed-in viewers. */
  isSignedIn: boolean;
};

/**
 * Records a "seen" view (`POST /posts/{id}/view`) once a post has been the
 * active, fully-visible, foreground card for ≥ 1s within ONE visit.
 *
 * - Separate visits are not summed: leaving for another post resets the clock.
 * - Prefetched / off-screen posts never become active, so they never count.
 * - `document.hidden` (background) and an open overlay (the shell passes
 *   `activePostId: null`) pause the visit; returning to the same card resumes it.
 * - Flicking past in < 1s leaves the post unseen.
 * - Fires at most once per post; signed-out viewers record nothing.
 */
export function usePostViewTracker(options: UsePostViewTrackerOptions): void {
  const { activePostId, isSignedIn } = options;

  const visitRef = useRef<VisitState>(createVisitState());
  const reportedRef = useRef<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const report = useCallback((postId: string) => {
    if (reportedRef.current.has(postId)) return;
    reportedRef.current.add(postId);
    // Fire-and-forget; a failed view record must not disturb the feed.
    void fetch(buildClientApiPath(`/posts/${encodeURIComponent(postId)}/view`), {
      method: "POST",
      cache: "no-store",
      keepalive: true,
    }).catch(() => {});
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const apply = useCallback(
    (step: VisitStep) => {
      visitRef.current = step.state;
      if (step.seenPostId) report(step.seenPostId);
    },
    [report],
  );

  const schedule = useCallback(() => {
    clearTimer();
    const visit = visitRef.current;
    if (visit.postId && reportedRef.current.has(visit.postId)) return;
    const remaining = remainingVisitMs(visit, Date.now());
    if (remaining === null) return;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      apply(checkVisit(visitRef.current, Date.now()));
    }, remaining + 20);
  }, [apply, clearTimer]);

  // Track the active post transitions.
  useEffect(() => {
    if (!isSignedIn) return;
    const hidden = typeof document !== "undefined" && document.hidden;
    const step = setActivePost(visitRef.current, activePostId, Date.now());
    apply(step);
    if (hidden) apply(pauseVisit(visitRef.current, Date.now()));
    schedule();
    return () => {
      // Dep change / unmount: pause and fold the running interval in.
      clearTimer();
      apply(pauseVisit(visitRef.current, Date.now()));
    };
  }, [activePostId, isSignedIn, apply, schedule, clearTimer]);

  // Pause counting while the tab / app is backgrounded.
  useEffect(() => {
    if (!isSignedIn) return;
    const onVisibility = () => {
      if (document.hidden) {
        clearTimer();
        apply(pauseVisit(visitRef.current, Date.now()));
      } else if (activePostId && visitRef.current.postId === activePostId) {
        visitRef.current = resumeVisit(visitRef.current, Date.now());
        schedule();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [activePostId, isSignedIn, apply, schedule, clearTimer]);
}

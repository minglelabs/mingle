"use client";

import { feedEvents, noteFeedShown, recordFeedSeen, trackFeedEvent, type FeedPostContext, type FeedSurface } from "@/lib/feed-analytics";
import { useCallback, useEffect, useRef } from "react";
import {
  createExposureState,
  exposurePause,
  exposureResume,
  exposureSetActive,
  exposureTick,
  type ExposureState,
  type ExposureStep,
} from "./feed-exposure";
import { remainingVisitMs } from "./view-dwell";

type UseFeedExposureTrackerOptions = {
  /** Entry key of the active card; null while an overlay is open or uncertain. */
  activeKey: string | null;
  surface: FeedSurface;
  /** Content-free context of an appearance (read when an event is sent). */
  contextFor: (key: string) => FeedPostContext | null;
};

/**
 * Sends the impression / quick-skip events and the revisit session event.
 * Uses the same visit clock as `usePostViewTracker` (background and overlays
 * pause it and send nothing), but runs for every viewer, since measurement
 * does not depend on the signed-in-only view record.
 */
export function useFeedExposureTracker({ activeKey, surface, contextFor }: UseFeedExposureTrackerOptions): void {
  const stateRef = useRef<ExposureState>(createExposureState());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contextRef = useRef(contextFor);
  // Declared before the tracking effects so they read the current resolver.
  useEffect(() => {
    contextRef.current = contextFor;
  });
  // Context captured when a card became active, so a later list change
  // cannot re-attribute the event to another appearance.
  const snapshotRef = useRef<Map<string, FeedPostContext>>(new Map());

  const apply = useCallback((step: ExposureStep) => {
    stateRef.current = step.state;
    for (const signal of step.signals) {
      const ctx = snapshotRef.current.get(signal.key) ?? contextRef.current(signal.key);
      if (!ctx) continue;
      if (signal.kind === "impression") trackFeedEvent(feedEvents.postImpressed(ctx));
      else trackFeedEvent(feedEvents.postSkipped(ctx, signal.dwellMs));
    }
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const schedule = useCallback(() => {
    clearTimer();
    const remaining = remainingVisitMs(stateRef.current.visit, Date.now());
    if (remaining === null) return;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      apply(exposureTick(stateRef.current, Date.now()));
    }, remaining + 20);
  }, [apply, clearTimer]);

  // Revisit: the feed is on screen now.
  useEffect(() => {
    if (typeof document !== "undefined" && document.hidden) return;
    noteFeedShown(surface);
  }, [surface]);

  useEffect(() => {
    if (activeKey !== null && !snapshotRef.current.has(activeKey)) {
      const ctx = contextRef.current(activeKey);
      if (ctx) snapshotRef.current.set(activeKey, ctx);
    }
    const now = Date.now();
    apply(exposureSetActive(stateRef.current, activeKey, now));
    if (typeof document !== "undefined" && document.hidden) apply(exposurePause(stateRef.current, now));
    else if (activeKey !== null) recordFeedSeen(now);
    schedule();
    return () => {
      clearTimer();
      const at = Date.now();
      apply(exposurePause(stateRef.current, at));
      recordFeedSeen(at);
    };
  }, [activeKey, surface, apply, schedule, clearTimer]);

  useEffect(() => {
    const onVisibility = () => {
      const now = Date.now();
      if (document.hidden) {
        clearTimer();
        apply(exposurePause(stateRef.current, now));
        recordFeedSeen(now);
      } else {
        noteFeedShown(surface, now);
        if (activeKey !== null && stateRef.current.visit.postId === activeKey) {
          stateRef.current = exposureResume(stateRef.current, now);
          schedule();
        }
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [activeKey, surface, apply, schedule, clearTimer]);
}

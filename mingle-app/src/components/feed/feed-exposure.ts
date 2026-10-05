/**
 * Exposure / quick-skip classification for feed analytics, built on the SAME
 * visit rules as the "seen" view (`view-dwell.ts`): one visit = one continuous
 * stay on a card; background and open overlays pause the clock and never
 * count; separate visits are never summed.
 *
 * - Impression: the visit crossed `SEEN_DWELL_MS` (sent once per visit, the
 *   moment it crosses, via the visit's fire-once latch).
 * - Quick skip: the visit ended (another card became active) before crossing,
 *   with some foreground dwell. A visit that never had foreground time (e.g.
 *   the app was in the background) is neither.
 *
 * Pure, so the classification is unit-tested without React or timers.
 */

import {
  checkVisit,
  createVisitState,
  currentDwellMs,
  pauseVisit,
  resumeVisit,
  setActivePost,
  type VisitState,
} from "./view-dwell";

export type ExposureSignal =
  | { kind: "impression"; key: string }
  | { kind: "skip"; key: string; dwellMs: number };

/**
 * `key` identifies one card appearance (the feed entry key), so a post that
 * repeats in a later cycle is a separate visit with its own position.
 */
export type ExposureState = {
  visit: VisitState;
};

export type ExposureStep = {
  state: ExposureState;
  signals: ExposureSignal[];
};

export function createExposureState(): ExposureState {
  return { visit: createVisitState() };
}

function seen(signals: ExposureSignal[], seenKey: string | null): ExposureSignal[] {
  return seenKey ? [...signals, { kind: "impression", key: seenKey }] : signals;
}

/** The active card changed (`null` = overlay open / no certain card: pause). */
export function exposureSetActive(state: ExposureState, nextKey: string | null, now: number): ExposureStep {
  const prev = state.visit;
  const step = setActivePost(prev, nextKey, now);
  const signals = seen([], step.seenPostId);
  // A different card replaced the visit: a visit that ended below the
  // threshold (with some foreground time) was a quick skip.
  if (nextKey !== null && prev.postId !== null && prev.postId !== nextKey) {
    const ended = pauseVisit(prev, now).state.acc;
    const dwellMs = currentDwellMs(ended, now);
    if (!ended.reported && dwellMs > 0) {
      signals.push({ kind: "skip", key: prev.postId, dwellMs });
    }
  }
  return { state: { visit: step.state }, signals };
}

/** App backgrounded: pause without ending the visit. */
export function exposurePause(state: ExposureState, now: number): ExposureStep {
  const step = pauseVisit(state.visit, now);
  return { state: { visit: step.state }, signals: seen([], step.seenPostId) };
}

/** Foreground again on the same card. */
export function exposureResume(state: ExposureState, now: number): ExposureState {
  return { visit: resumeVisit(state.visit, now) };
}

/** Timer tick while a visit runs. */
export function exposureTick(state: ExposureState, now: number): ExposureStep {
  const step = checkVisit(state.visit, now);
  return { state: { visit: step.state }, signals: seen([], step.seenPostId) };
}

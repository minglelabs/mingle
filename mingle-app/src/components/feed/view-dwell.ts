/**
 * Pure dwell-time accounting for the "seen post" rule, kept free of DOM/React
 * so the 1-second threshold and the background-exclusion are unit-tested.
 *
 * A post counts as *seen* once it has been the fully-visible, foreground post
 * for at least 1000 ms within ONE visit (see "Visit" below; separate visits
 * are never summed). Time spent while the tab is hidden
 * (`document.hidden`), while the post is only prefetched (never the active
 * card), or before it became active does not count. Flicking past a post in
 * under a second must not mark it seen.
 */

export const SEEN_DWELL_MS = 1000;

export type DwellAccumulator = {
  /** Milliseconds of foreground, fully-visible time accrued so far. */
  accumulatedMs: number;
  /** Timestamp (ms) the current active+visible interval started, or null. */
  activeSince: number | null;
  /** Whether the post has already crossed the threshold (fire-once latch). */
  reported: boolean;
};

export function createDwellAccumulator(): DwellAccumulator {
  return { accumulatedMs: 0, activeSince: null, reported: false };
}

/**
 * Begin (or resume) counting for a post that is now the active, fully-visible,
 * foreground card. No-op if already counting.
 */
export function startInterval(acc: DwellAccumulator, now: number): DwellAccumulator {
  if (acc.activeSince !== null) return acc;
  return { ...acc, activeSince: now };
}

/**
 * Stop counting (post scrolled away, tab hidden, or unmounted) and fold the
 * elapsed interval into the accumulated total.
 */
export function stopInterval(acc: DwellAccumulator, now: number): DwellAccumulator {
  if (acc.activeSince === null) return acc;
  const elapsed = Math.max(0, now - acc.activeSince);
  return { ...acc, accumulatedMs: acc.accumulatedMs + elapsed, activeSince: null };
}

/** Total dwell including any currently-running interval, without mutating. */
export function currentDwellMs(acc: DwellAccumulator, now: number): number {
  const running = acc.activeSince === null ? 0 : Math.max(0, now - acc.activeSince);
  return acc.accumulatedMs + running;
}

/**
 * Whether the post has now been seen and should be reported. Returns the
 * (possibly latched) accumulator plus whether this call is the transition that
 * should trigger the single `POST /view`.
 */
export function evaluateSeen(
  acc: DwellAccumulator,
  now: number,
): { acc: DwellAccumulator; shouldReport: boolean } {
  if (acc.reported) return { acc, shouldReport: false };
  if (currentDwellMs(acc, now) >= SEEN_DWELL_MS) {
    return { acc: { ...acc, reported: true }, shouldReport: true };
  }
  return { acc, shouldReport: false };
}

// ---------------------------------------------------------------------------
// Visit: the dwell of ONE continuous stay on a card
// ---------------------------------------------------------------------------
//
// The 1s rule is per visit: time from separate visits is never summed, so
// flicking past a post twice for 0.6s each leaves it unseen. A visit starts
// when a post becomes the active card and ends when a DIFFERENT post becomes
// active. Inside a visit the clock only pauses — while the app is in the
// background, or while an overlay (comment sheet, menu) is open, during which
// the shell reports no active post — and resumes when the same card is
// active and foreground again.

export type VisitState = {
  /** Post of the current visit (active or paused), or null before any. */
  postId: string | null;
  acc: DwellAccumulator;
};

export type VisitStep = {
  state: VisitState;
  /** Post that just crossed the threshold in this step, if any. */
  seenPostId: string | null;
};

export function createVisitState(): VisitState {
  return { postId: null, acc: createDwellAccumulator() };
}

function settle(state: VisitState, acc: DwellAccumulator, now: number): VisitStep {
  const { acc: next, shouldReport } = evaluateSeen(acc, now);
  return { state: { ...state, acc: next }, seenPostId: shouldReport ? state.postId : null };
}

/** Pause the running visit (background / overlay), keeping its dwell. */
export function pauseVisit(state: VisitState, now: number): VisitStep {
  if (state.postId === null) return { state, seenPostId: null };
  return settle(state, stopInterval(state.acc, now), now);
}

/** Resume the current visit (foreground again, same card). */
export function resumeVisit(state: VisitState, now: number): VisitState {
  if (state.postId === null) return state;
  return { ...state, acc: startInterval(state.acc, now) };
}

/**
 * The shell's active card changed. `null` = no active card (overlay,
 * uncertain position): the visit pauses. The same post again: the visit
 * resumes. Another post: the old visit ends (its dwell is dropped) and a new
 * one starts from zero.
 */
export function setActivePost(state: VisitState, nextPostId: string | null, now: number): VisitStep {
  const paused = pauseVisit(state, now);
  if (nextPostId === null) return paused;
  if (nextPostId === paused.state.postId) {
    return { state: resumeVisit(paused.state, now), seenPostId: paused.seenPostId };
  }
  const fresh: VisitState = { postId: nextPostId, acc: startInterval(createDwellAccumulator(), now) };
  return { state: fresh, seenPostId: paused.seenPostId };
}

/** Timer tick: has the running visit crossed the threshold? */
export function checkVisit(state: VisitState, now: number): VisitStep {
  if (state.postId === null) return { state, seenPostId: null };
  return settle(state, state.acc, now);
}

/** Ms left until the running visit reaches the threshold; null if not running. */
export function remainingVisitMs(state: VisitState, now: number): number | null {
  if (state.postId === null || state.acc.activeSince === null || state.acc.reported) return null;
  return Math.max(0, SEEN_DWELL_MS - currentDwellMs(state.acc, now));
}

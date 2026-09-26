/**
 * Pure dwell-time accounting for the "seen post" rule, kept free of DOM/React
 * so the 1-second threshold and the background-exclusion are unit-tested.
 *
 * A post counts as *seen* once it has been the fully-visible, foreground post
 * for at least 1000 ms of accumulated time. Time spent while the tab is hidden
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

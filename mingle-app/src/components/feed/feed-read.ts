/**
 * "Read the body" rule for feed analytics (checklist 90).
 *
 * After the viewer expanded a post, it counts as read when EITHER
 * - the expanded body is scrollable and was scrolled to its end, OR
 * - the body is short (no scroll) and stayed expanded on the active,
 *   foreground card for >= 3 s. Background time and open overlays do not
 *   count (same pause rule as the seen-view dwell).
 *
 * Pure helpers; the card owns the timers.
 */

export const READ_DWELL_MS = 3000;

/** Pixel slack for sub-pixel scroll positions. */
const END_SLACK_PX = 2;

export type ScrollMetrics = { scrollTop: number; clientHeight: number; scrollHeight: number };

export function isScrolledToEnd(m: ScrollMetrics): boolean {
  return m.scrollTop + m.clientHeight >= m.scrollHeight - END_SLACK_PX;
}

export type ReadInput = {
  expanded: boolean;
  bodyNeedsScroll: boolean;
  scrolledToEnd: boolean;
  /** Foreground, active-card dwell accrued while expanded. */
  expandedDwellMs: number;
};

export type ReadVerdict = "scrolled_to_end" | "dwell" | null;

export function readVerdict(input: ReadInput): ReadVerdict {
  if (!input.expanded) return null;
  if (input.bodyNeedsScroll) return input.scrolledToEnd ? "scrolled_to_end" : null;
  return input.expandedDwellMs >= READ_DWELL_MS ? "dwell" : null;
}

/** Whether the dwell clock for a short body should be running now. */
export function readClockRunning(state: { expanded: boolean; bodyNeedsScroll: boolean; active: boolean; hidden: boolean }): boolean {
  return state.expanded && !state.bodyNeedsScroll && state.active && !state.hidden;
}

/**
 * Pull-to-close from the comment list: once the list is scrolled all the way
 * up, pulling down moves the whole sheet instead of the list, and letting go
 * far enough (or fast enough) closes it, like a pull on the header does.
 */

/** Movement (px) before a gesture commits to a direction. */
export const PULL_SLOP_PX = 8;
/** Pull distance (px) that closes the sheet on release. Same as the header drag. */
export const PULL_DISMISS_DISTANCE_PX = 110;
/** Downward release speed (px/s) that closes a shorter pull. Same as the header drag. */
export const PULL_DISMISS_VELOCITY_PX_PER_S = 600;
/** A flick must still have moved this far (px), so a twitch springs back. */
export const PULL_FLICK_MIN_DISTANCE_PX = 24;

/**
 * Whether a touch on the list should start moving the sheet: the list was at
 * its top when the touch began and the finger is going clearly down. An upward
 * or sideways move leaves the list to scroll as usual.
 */
export function shouldStartSheetPull(input: {
  startedAtTop: boolean;
  dx: number;
  dy: number;
  slop?: number;
}): boolean {
  const slop = input.slop ?? PULL_SLOP_PX;
  if (!input.startedAtTop) return false;
  if (input.dy < slop) return false;
  return input.dy > Math.abs(input.dx);
}

/** Whether letting go of a list pull closes the sheet. */
export function shouldClosePulledSheet(input: { offsetY: number; velocityY: number }): boolean {
  if (input.offsetY >= PULL_DISMISS_DISTANCE_PX) return true;
  return input.offsetY >= PULL_FLICK_MIN_DISTANCE_PX && input.velocityY >= PULL_DISMISS_VELOCITY_PX_PER_S;
}

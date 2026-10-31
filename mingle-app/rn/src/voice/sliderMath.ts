// Pure slider math, framework-free so it is unit-testable without React Native.

/** Convert an x touch within a track of `width` px to a 0..1 fraction. */
export function fractionFromTouch(x: number, width: number): number {
  if (!Number.isFinite(width) || width <= 0) return 0;
  const clampedX = Math.max(0, Math.min(width, x));
  return clampedX / width;
}

export function percentLabel(fraction: number): string {
  return `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`;
}

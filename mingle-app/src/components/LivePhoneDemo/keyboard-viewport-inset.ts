// Keyboard inset helpers shared by the conversation room and the screens
// that only need these two functions (the feedback form in the notification
// panel). They live apart from LivePhoneDemo.tsx so that importing them does
// not pull the whole room and its speech engine into a screen's bundle.

const KEYBOARD_VIEWPORT_INSET_STABILITY_THRESHOLD_PX = 2

export function resolveKeyboardViewportInsetPx(viewport: VisualViewport | null | undefined): number {
  if (typeof window === 'undefined' || !viewport) return 0

  const inset = window.innerHeight - viewport.height - viewport.offsetTop
  if (!Number.isFinite(inset) || inset <= 0) return 0
  return Math.round(inset)
}

export function resolveStableKeyboardViewportInsetPx(currentInsetPx: number, nextInsetPx: number): number {
  const safeCurrentInsetPx = Number.isFinite(currentInsetPx) && currentInsetPx > 0
    ? Math.round(currentInsetPx)
    : 0
  const safeNextInsetPx = Number.isFinite(nextInsetPx) && nextInsetPx > 0
    ? Math.round(nextInsetPx)
    : 0

  if (safeCurrentInsetPx === 0 || safeNextInsetPx === 0) return safeNextInsetPx
  return Math.abs(safeCurrentInsetPx - safeNextInsetPx) < KEYBOARD_VIEWPORT_INSET_STABILITY_THRESHOLD_PX
    ? safeCurrentInsetPx
    : safeNextInsetPx
}

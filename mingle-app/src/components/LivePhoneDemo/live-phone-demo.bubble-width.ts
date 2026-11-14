import { useLayoutEffect, useRef, useSyncExternalStore, type RefObject } from 'react'

// A bubble does not shrink right away: while someone is still speaking, the
// text (and its translation) is rewritten many times, sometimes shorter
// (Soniox takes words back) and then longer again. A bubble that followed each
// rewrite narrower or shorter and back re-broke its lines and shook the
// transcript under the reader's eyes. The widest and tallest size a message
// has had is kept as its floor, also once the message is final. Only when the
// content stays smaller than that floor (the language row gone once the
// speech is final, a translation that really got shorter) does the bubble
// come down to its own size: it stays still for BUBBLE_SHRINK_HOLD_MS, then
// eases down over BUBBLE_SHRINK_EASE_MS, two seconds in all.

export const BUBBLE_SHRINK_HOLD_MS = 800
export const BUBBLE_SHRINK_EASE_MS = 1200

export type BubbleShrinkTiming = { holdMs: number; easeMs: number }
const DEFAULT_SHRINK_TIMING: BubbleShrinkTiming = {
  holdMs: BUBBLE_SHRINK_HOLD_MS,
  easeMs: BUBBLE_SHRINK_EASE_MS,
}
// With reduced motion the bubble waits the same two seconds and then takes
// its own size in one step.
const REDUCED_MOTION_SHRINK_TIMING: BubbleShrinkTiming = {
  holdMs: BUBBLE_SHRINK_HOLD_MS + BUBBLE_SHRINK_EASE_MS,
  easeMs: 0,
}

type BubbleSize = { width: number; height: number }
type BubbleSizeFloor = BubbleSize & { resetKey: string; shrinkSince: number | null }

// Kept outside the component so the floor survives a remount of the same
// message (a draft becoming a stored message swaps its wrapper element).
const MAX_REMEMBERED_FLOORS = 400
const floors = new Map<string, BubbleSizeFloor>()

export function readBubbleSizeFloor(
  messageId: string,
  resetKey: string,
): BubbleSize & { shrinkSince: number | null } {
  const remembered = floors.get(messageId)
  return remembered && remembered.resetKey === resetKey
    ? { width: remembered.width, height: remembered.height, shrinkSince: remembered.shrinkSince }
    : { width: 0, height: 0, shrinkSince: null }
}

export function rememberBubbleSizeFloor(
  messageId: string,
  resetKey: string,
  size: BubbleSize & { shrinkSince?: number | null },
): void {
  floors.delete(messageId)
  if (size.width <= 0 && size.height <= 0) return
  floors.set(messageId, {
    resetKey,
    width: Math.max(0, size.width),
    height: Math.max(0, size.height),
    shrinkSince: size.shrinkSince ?? null,
  })
  if (floors.size > MAX_REMEMBERED_FLOORS) {
    const oldest = floors.keys().next().value
    if (oldest !== undefined) floors.delete(oldest)
  }
}

const SIZE_TOLERANCE_PX = 0.5

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2)

export type BubbleSizeFloorStep = BubbleSize & {
  shrinkSince: number | null
  /** The minimum size to put on the bubble now. */
  shown: BubbleSize
  /** When to look again: null = settled, 0 = next frame (easing), else ms left of the hold. */
  retryInMs: number | null
}

/**
 * The next floor from the bubble's own size (measured with no floor on it).
 * Growth is taken at once. Content smaller than the floor keeps the floor
 * for `holdMs`; then `shown` eases from the floor down to the content over
 * `easeMs`, and at the end the floor itself comes down to the content. The
 * floor (width, height) stays at the held size the whole time, so content
 * that fills it again cancels the shrink, and `shown` depends only on the
 * clock, so a remounted bubble picks the motion up where it was.
 */
export function resolveBubbleSizeFloor(
  floor: BubbleSize & { shrinkSince: number | null },
  natural: BubbleSize,
  now: number,
  timing: BubbleShrinkTiming = DEFAULT_SHRINK_TIMING,
): BubbleSizeFloorStep {
  const settled: BubbleSizeFloorStep = {
    width: natural.width,
    height: natural.height,
    shrinkSince: null,
    shown: natural,
    retryInMs: null,
  }
  const isSmaller = natural.width < floor.width - SIZE_TOLERANCE_PX
    || natural.height < floor.height - SIZE_TOLERANCE_PX
  if (!isSmaller) return settled
  const shrinkSince = floor.shrinkSince ?? now
  const waited = now - shrinkSince
  if (waited >= timing.holdMs + timing.easeMs) return settled
  const held = {
    width: Math.max(floor.width, natural.width),
    height: Math.max(floor.height, natural.height),
  }
  if (waited < timing.holdMs) {
    return { ...held, shrinkSince, shown: held, retryInMs: timing.holdMs - waited }
  }
  const left = 1 - easeInOutCubic((waited - timing.holdMs) / timing.easeMs)
  return {
    ...held,
    shrinkSince,
    shown: {
      width: natural.width + (held.width - natural.width) * left,
      height: natural.height + (held.height - natural.height) * left,
    },
    retryInMs: 0,
  }
}

export function forgetAllBubbleSizeFloors(): void {
  floors.clear()
}

// The floor must give way when the room for the bubble got smaller than the
// floor itself (rotation, a wider column beside it): a bubble held wider than
// its slot would stick out of the screen.
export function isBubbleWidthFloorTooWide(bubbleWidth: number, availableWidth: number): boolean {
  return bubbleWidth > availableWidth + 0.5
}

function subscribeToViewportWidth(onChange: () => void): () => void {
  window.addEventListener('resize', onChange)
  return () => window.removeEventListener('resize', onChange)
}
const readViewportWidth = () => window.innerWidth
const readServerViewportWidth = () => 0

const BUBBLE_SLOT_SELECTOR = '[data-chat-bubble-content-switch]'

function readShrinkTiming(): BubbleShrinkTiming {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ? REDUCED_MOTION_SHRINK_TIMING
    : DEFAULT_SHRINK_TIMING
}

/**
 * Holds the bubble at the largest width and height it has reached; once its
 * content has stayed smaller for BUBBLE_SHRINK_HOLD_MS it eases down to it.
 * `layoutKey` names what makes an old size meaningless (text size, the
 * expanded or collapsed layout); the viewport width is added to it here.
 * Runs after every render, because any render may have changed the text.
 */
export function useMonotonicBubbleSize(
  messageId: string,
  layoutKey: string,
  bubbleRef: RefObject<HTMLElement | null>,
): void {
  const viewportWidth = useSyncExternalStore(subscribeToViewportWidth, readViewportWidth, readServerViewportWidth)
  const resetKey = `${layoutKey}|${viewportWidth}`
  // What is waiting to look again: the hold's timer or the next easing frame.
  const cancelPendingRef = useRef<(() => void) | null>(null)

  useLayoutEffect(() => {
    const bubble = bubbleRef.current
    if (!bubble) return
    const timing = readShrinkTiming()

    const put = (next: BubbleSizeFloorStep, natural: BubbleSize) => {
      bubble.style.minWidth = next.shown.width > 0 ? `${next.shown.width}px` : ''
      bubble.style.minHeight = next.shown.height > 0 ? `${next.shown.height}px` : ''
      rememberBubbleSizeFloor(messageId, resetKey, next)

      cancelPendingRef.current?.()
      cancelPendingRef.current = null
      if (next.retryInMs === null) return
      const isAlive = () => bubbleRef.current === bubble && bubble.isConnected
      if (next.retryInMs > 0) {
        const timer = setTimeout(() => {
          cancelPendingRef.current = null
          if (isAlive()) applyFloor()
        }, next.retryInMs)
        cancelPendingRef.current = () => clearTimeout(timer)
        return
      }
      // Easing: the content did not change between frames (a change renders
      // and measures again), so the frames reuse the measured size and only
      // the last one measures, when the floor comes off.
      const frame = requestAnimationFrame(() => {
        cancelPendingRef.current = null
        if (!isAlive()) return
        const step = resolveBubbleSizeFloor(readBubbleSizeFloor(messageId, resetKey), natural, Date.now(), timing)
        if (step.retryInMs === null) applyFloor()
        else put(step, natural)
      })
      cancelPendingRef.current = () => cancelAnimationFrame(frame)
    }

    const applyFloor = () => {
      const previous = readBubbleSizeFloor(messageId, resetKey)
      // The bubble's own size, with no floor on it. Nothing paints between
      // this and the floor going back on below.
      bubble.style.minWidth = ''
      bubble.style.minHeight = ''
      const natural = { width: bubble.offsetWidth, height: bubble.offsetHeight }
      const slot = bubble.closest<HTMLElement>(BUBBLE_SLOT_SELECTOR)
      if (previous.width > 0 && slot && isBubbleWidthFloorTooWide(previous.width, slot.clientWidth)) {
        previous.width = 0
      }
      put(resolveBubbleSizeFloor(previous, natural, Date.now(), timing), natural)
    }
    applyFloor()
  })

  useLayoutEffect(() => () => {
    cancelPendingRef.current?.()
    cancelPendingRef.current = null
  }, [])
}

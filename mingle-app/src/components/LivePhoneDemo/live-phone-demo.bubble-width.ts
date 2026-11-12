import { useLayoutEffect, useRef, useSyncExternalStore, type RefObject } from 'react'

// A bubble does not shrink right away: while someone is still speaking, the
// text (and its translation) is rewritten many times, sometimes shorter
// (Soniox takes words back) and then longer again. A bubble that followed each
// rewrite narrower or shorter and back re-broke its lines and shook the
// transcript under the reader's eyes. The widest and tallest size a message
// has had is kept as its floor, also once the message is final. Only when the
// content stays smaller than that floor for BUBBLE_SHRINK_HOLD_MS (the
// language row gone once the speech is final, a translation that really got
// shorter) does the bubble come down to its own size.

export const BUBBLE_SHRINK_HOLD_MS = 2000

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

/**
 * The next floor from the bubble's own size (measured with no floor on it).
 * Growth is taken at once; content smaller than the floor keeps the floor
 * until it has stayed smaller for `holdMs`, then the floor comes down to it.
 * `retryInMs` says when to look again while a shrink is waiting.
 */
export function resolveBubbleSizeFloor(
  floor: BubbleSize & { shrinkSince: number | null },
  natural: BubbleSize,
  now: number,
  holdMs: number = BUBBLE_SHRINK_HOLD_MS,
): BubbleSize & { shrinkSince: number | null; retryInMs: number | null } {
  const isSmaller = natural.width < floor.width - SIZE_TOLERANCE_PX
    || natural.height < floor.height - SIZE_TOLERANCE_PX
  if (!isSmaller) {
    return { width: natural.width, height: natural.height, shrinkSince: null, retryInMs: null }
  }
  const shrinkSince = floor.shrinkSince ?? now
  const waited = now - shrinkSince
  if (waited >= holdMs) {
    return { width: natural.width, height: natural.height, shrinkSince: null, retryInMs: null }
  }
  return {
    width: Math.max(floor.width, natural.width),
    height: Math.max(floor.height, natural.height),
    shrinkSince,
    retryInMs: holdMs - waited,
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

/**
 * Holds the bubble at the largest width and height it has reached, until
 * its content has stayed smaller for BUBBLE_SHRINK_HOLD_MS.
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
  const shrinkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useLayoutEffect(() => {
    const bubble = bubbleRef.current
    if (!bubble) return

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
      const next = resolveBubbleSizeFloor(previous, natural, Date.now())
      bubble.style.minWidth = next.width > 0 ? `${next.width}px` : ''
      bubble.style.minHeight = next.height > 0 ? `${next.height}px` : ''
      rememberBubbleSizeFloor(messageId, resetKey, next)

      if (shrinkTimerRef.current !== null) {
        clearTimeout(shrinkTimerRef.current)
        shrinkTimerRef.current = null
      }
      if (next.retryInMs !== null) {
        shrinkTimerRef.current = setTimeout(() => {
          shrinkTimerRef.current = null
          if (bubbleRef.current === bubble && bubble.isConnected) applyFloor()
        }, next.retryInMs + 16)
      }
    }
    applyFloor()
  })

  useLayoutEffect(() => () => {
    if (shrinkTimerRef.current !== null) clearTimeout(shrinkTimerRef.current)
  }, [])
}

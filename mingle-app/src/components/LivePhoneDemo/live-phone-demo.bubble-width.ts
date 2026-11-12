import { useLayoutEffect, useSyncExternalStore, type RefObject } from 'react'

// A bubble only ever gets wider: while someone is still speaking, the text
// (and its translation) is rewritten many times, and a bubble that follows
// each rewrite narrower and wider again re-breaks every line under the
// reader's eyes. The widest width a message has had is kept as its floor.

type BubbleWidthFloor = { resetKey: string; width: number }

// Kept outside the component so the floor survives a remount of the same
// message (a draft becoming a stored message swaps its wrapper element).
const MAX_REMEMBERED_FLOORS = 400
const floors = new Map<string, BubbleWidthFloor>()

export function readBubbleWidthFloor(messageId: string, resetKey: string): number {
  const remembered = floors.get(messageId)
  return remembered && remembered.resetKey === resetKey ? remembered.width : 0
}

export function rememberBubbleWidthFloor(messageId: string, resetKey: string, width: number): void {
  floors.delete(messageId)
  if (width <= 0) return
  floors.set(messageId, { resetKey, width })
  if (floors.size > MAX_REMEMBERED_FLOORS) {
    const oldest = floors.keys().next().value
    if (oldest !== undefined) floors.delete(oldest)
  }
}

export function forgetAllBubbleWidthFloors(): void {
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
 * Holds the bubble at the widest width it has reached. `layoutKey` names what
 * makes an old width meaningless (text size); the viewport width is added to
 * it here. Runs after every render, because any render may have changed the text.
 */
export function useMonotonicBubbleWidth(
  messageId: string,
  layoutKey: string,
  bubbleRef: RefObject<HTMLElement | null>,
): void {
  const viewportWidth = useSyncExternalStore(subscribeToViewportWidth, readViewportWidth, readServerViewportWidth)
  const resetKey = `${layoutKey}|${viewportWidth}`

  useLayoutEffect(() => {
    const bubble = bubbleRef.current
    if (!bubble) return

    let floor = readBubbleWidthFloor(messageId, resetKey)
    bubble.style.minWidth = floor > 0 ? `${floor}px` : ''
    let width = bubble.offsetWidth

    const slot = bubble.closest<HTMLElement>(BUBBLE_SLOT_SELECTOR)
    if (floor > 0 && slot && isBubbleWidthFloorTooWide(width, slot.clientWidth)) {
      bubble.style.minWidth = ''
      width = bubble.offsetWidth
      floor = 0
    }

    if (width > floor) {
      floor = width
      bubble.style.minWidth = `${floor}px`
    }
    rememberBubbleWidthFloor(messageId, resetKey, floor)
  })
}

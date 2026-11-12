import { useLayoutEffect, useSyncExternalStore, type RefObject } from 'react'

// A bubble only ever gets bigger: while someone is still speaking, the text
// (and its translation) is rewritten many times, sometimes shorter (Soniox
// takes words back) and then longer again. A bubble that followed each
// rewrite narrower or shorter and back re-broke its lines and shook the
// transcript under the reader's eyes. The widest and tallest size a message
// has had is kept as its floor, also once the message is final.

type BubbleSizeFloor = { resetKey: string; width: number; height: number }

// Kept outside the component so the floor survives a remount of the same
// message (a draft becoming a stored message swaps its wrapper element).
const MAX_REMEMBERED_FLOORS = 400
const floors = new Map<string, BubbleSizeFloor>()

export function readBubbleSizeFloor(messageId: string, resetKey: string): { width: number; height: number } {
  const remembered = floors.get(messageId)
  return remembered && remembered.resetKey === resetKey
    ? { width: remembered.width, height: remembered.height }
    : { width: 0, height: 0 }
}

export function rememberBubbleSizeFloor(
  messageId: string,
  resetKey: string,
  size: { width: number; height: number },
): void {
  floors.delete(messageId)
  if (size.width <= 0 && size.height <= 0) return
  floors.set(messageId, { resetKey, width: Math.max(0, size.width), height: Math.max(0, size.height) })
  if (floors.size > MAX_REMEMBERED_FLOORS) {
    const oldest = floors.keys().next().value
    if (oldest !== undefined) floors.delete(oldest)
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
 * Holds the bubble at the largest width and height it has reached.
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

  useLayoutEffect(() => {
    const bubble = bubbleRef.current
    if (!bubble) return

    const floor = readBubbleSizeFloor(messageId, resetKey)
    bubble.style.minWidth = floor.width > 0 ? `${floor.width}px` : ''
    bubble.style.minHeight = floor.height > 0 ? `${floor.height}px` : ''
    let width = bubble.offsetWidth

    const slot = bubble.closest<HTMLElement>(BUBBLE_SLOT_SELECTOR)
    if (floor.width > 0 && slot && isBubbleWidthFloorTooWide(width, slot.clientWidth)) {
      bubble.style.minWidth = ''
      width = bubble.offsetWidth
      floor.width = 0
    }
    if (width > floor.width) {
      floor.width = width
      bubble.style.minWidth = `${width}px`
    }

    const height = bubble.offsetHeight
    if (height > floor.height) {
      floor.height = height
      bubble.style.minHeight = `${height}px`
    }
    rememberBubbleSizeFloor(messageId, resetKey, floor)
  })
}

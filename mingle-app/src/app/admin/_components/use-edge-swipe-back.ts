'use client'

import { useEffect, type RefObject } from 'react'
import { isLeftEdgeSwipeBack, isLeftEdgeSwipeStart } from '@/lib/edge-swipe'
import { registerNativeEdgeSwipeSuppression } from '@/components/slide-surface'

const SETTLE_MS = 180

/**
 * Left-edge swipe to leave a full-screen admin screen on a phone: the screen
 * follows the finger and, past the threshold, slides out and calls `onBack`.
 * The app's own WebView back gesture is turned off meanwhile, so the two
 * never both act on one swipe.
 */
export function useEdgeSwipeBack(ref: RefObject<HTMLElement | null>, enabled: boolean, onBack: () => void): void {
  useEffect(() => {
    const element = ref.current
    if (!enabled || !element) return
    const releaseNative = registerNativeEdgeSwipeSuppression()
    let start: { x: number; y: number } | null = null
    let dragging = false
    let leaving = false
    let settleTimer: number | null = null

    const settle = (x: string, then?: () => void) => {
      element.style.transition = `transform ${SETTLE_MS}ms ease-out`
      element.style.transform = x
      if (settleTimer !== null) window.clearTimeout(settleTimer)
      settleTimer = window.setTimeout(() => {
        settleTimer = null
        if (then) then()
        else {
          element.style.transition = ''
          element.style.transform = ''
        }
      }, SETTLE_MS)
    }

    const onStart = (event: TouchEvent) => {
      const touch = event.touches[0]
      start = !leaving && event.touches.length === 1 && isLeftEdgeSwipeStart(touch.clientX)
        ? { x: touch.clientX, y: touch.clientY }
        : null
      dragging = false
    }
    const onMove = (event: TouchEvent) => {
      if (!start) return
      const touch = event.touches[0]
      const deltaX = touch.clientX - start.x
      const deltaY = Math.abs(touch.clientY - start.y)
      if (!dragging) {
        // A vertical move is a scroll: leave it alone for the rest of this touch.
        if (deltaY > 12 && deltaY > deltaX) { start = null; return }
        if (deltaX < 8) return
        dragging = true
        element.style.transition = ''
      }
      // The swipe is ours now: keep the page from scrolling under it.
      if (event.cancelable) event.preventDefault()
      element.style.transform = `translateX(${Math.max(0, deltaX)}px)`
    }
    const onEnd = (event: TouchEvent) => {
      if (!start) return
      const from = start
      start = null
      if (!dragging) return
      dragging = false
      const touch = event.changedTouches[0]
      if (touch && isLeftEdgeSwipeBack(from, { x: touch.clientX, y: touch.clientY }, window.innerWidth)) {
        leaving = true
        settle('translateX(100%)', onBack)
      } else {
        settle('translateX(0px)')
      }
    }

    element.addEventListener('touchstart', onStart, { passive: true })
    element.addEventListener('touchmove', onMove, { passive: false })
    element.addEventListener('touchend', onEnd)
    element.addEventListener('touchcancel', onEnd)
    return () => {
      releaseNative()
      if (settleTimer !== null) window.clearTimeout(settleTimer)
      element.removeEventListener('touchstart', onStart)
      element.removeEventListener('touchmove', onMove)
      element.removeEventListener('touchend', onEnd)
      element.removeEventListener('touchcancel', onEnd)
      element.style.transition = ''
      element.style.transform = ''
    }
  }, [enabled, onBack, ref])
}

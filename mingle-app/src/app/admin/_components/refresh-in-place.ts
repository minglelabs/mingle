import { ADMIN_SCROLL_CONTAINER_ID } from './ui'

const WATCH_MS = 5000

/**
 * router.refresh() without losing the reader's place. Next 16 runs a refresh
 * as a navigation to the same URL and scrolls the page back to its top, so a
 * post hidden or edited far down the feed jumped the screen to the newest
 * posts (staff, 2026-11-25). The scroll is put back when that jump comes.
 */
export function refreshInPlace(router: { refresh: () => void }): void {
  const scroller = typeof document === 'undefined' ? null : document.getElementById(ADMIN_SCROLL_CONTAINER_ID)
  const top = scroller?.scrollTop ?? 0
  router.refresh()
  if (!scroller || top < 50) return
  const until = Date.now() + WATCH_MS
  const watch = () => {
    // The jump: the screen lands at (or near) the top while the reader was far below it.
    if (scroller.scrollTop < 5) {
      scroller.scrollTop = top
      return
    }
    if (Date.now() < until) requestAnimationFrame(watch)
  }
  requestAnimationFrame(watch)
}

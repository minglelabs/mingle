import { ADMIN_SCROLL_CONTAINER_ID } from './ui'

const WATCH_MS = 5000

/**
 * Keeps the reader's place through something that may re-render the page:
 * Next 16 runs a refresh, and a server action it counts as revalidating, as a
 * navigation to the same URL and scrolls the page back to its top. A post
 * hidden or edited far down the feed, or the next page loading at its end,
 * jumped the screen to the newest posts (staff, 2026-11-25). Watches for that
 * jump for a few seconds and puts the scroll back.
 */
export function holdScrollPlace(): void {
  const scroller = typeof document === 'undefined' ? null : document.getElementById(ADMIN_SCROLL_CONTAINER_ID)
  if (!scroller) return
  const top = scroller.scrollTop
  if (top < 50) return
  const until = Date.now() + WATCH_MS
  let last = top
  const watch = () => {
    const now = scroller.scrollTop
    // The jump: the screen lands at (or near) the top in one go while the reader was far below it.
    if (now < 5 && last > 50) {
      scroller.scrollTop = last
    } else {
      last = now
    }
    if (Date.now() < until) requestAnimationFrame(watch)
  }
  requestAnimationFrame(watch)
}

/** router.refresh() without losing the reader's place (see holdScrollPlace). */
export function refreshInPlace(router: { refresh: () => void }): void {
  holdScrollPlace()
  router.refresh()
}

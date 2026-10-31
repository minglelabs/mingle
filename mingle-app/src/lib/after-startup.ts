/**
 * Holds back work the first screen does not need (tab prefetches, the unread
 * badge, analytics, overlays that only open on a native request) until the
 * page has loaded and the first screen has shown its content.
 *
 * On a cold start the app opens a fresh WebView, and everything that starts at
 * hydration competes with the first screen: the same server answers the feed
 * request and four tab prefetches, the network carries analytics scripts, and
 * the main thread parses chunks for overlays nobody opened. Waiting for the
 * load event also keeps injected scripts (lazy chunks, analytics) from
 * delaying it, which is what hides the native splash.
 *
 * The gate opens once the window has loaded AND either the first screen
 * reported its content (`markStartupContentReady`) or
 * `STARTUP_CONTENT_WAIT_MS` has passed since navigation start. It always opens
 * by `STARTUP_HARD_CAP_MS`, even if the load event never comes. After that,
 * scheduled work runs on the next tick, so later navigations are not delayed.
 */

/** Opens the gate for screens that never report their content. */
export const STARTUP_CONTENT_WAIT_MS = 2_500;
/** Opens the gate even if the load event never fires. */
export const STARTUP_HARD_CAP_MS = 6_000;

export type StartupGateInput = {
  /** `performance.now()`: ms since navigation start. */
  nowMs: number;
  /** The window load event has fired. */
  loaded: boolean;
  /** The first screen reported its content. */
  contentReady: boolean;
};

/**
 * 0 when the gate is open; otherwise the ms until the next deadline that could
 * open it (the load / content events can open it earlier).
 */
export function resolveStartupGateDelayMs({ nowMs, loaded, contentReady }: StartupGateInput): number {
  const now = Number.isFinite(nowMs) ? Math.max(0, nowMs) : STARTUP_HARD_CAP_MS;
  if (now >= STARTUP_HARD_CAP_MS) return 0;
  if (loaded && (contentReady || now >= STARTUP_CONTENT_WAIT_MS)) return 0;
  const nextDeadline = loaded ? STARTUP_CONTENT_WAIT_MS : STARTUP_HARD_CAP_MS;
  return Math.max(1, Math.ceil(nextDeadline - now));
}

let contentReady = false;
const contentReadyListeners = new Set<() => void>();

/** Called by the first screen once its content is on screen (or failed). */
export function markStartupContentReady(): void {
  if (contentReady) return;
  contentReady = true;
  const listeners = Array.from(contentReadyListeners);
  contentReadyListeners.clear();
  listeners.forEach((listener) => listener());
}

/** Test-only: forget a reported first screen. */
export function __resetStartupContentReady(): void {
  contentReady = false;
  contentReadyListeners.clear();
}

/**
 * Runs `task` once the startup gate is open (see above). Returns a cancel
 * function. Server rendering never runs it.
 */
export function runAfterStartup(task: () => void): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};

  let done = false;
  let timer: number | null = null;
  let frame: number | null = null;

  const clearPending = () => {
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
    window.removeEventListener("load", check);
    contentReadyListeners.delete(check);
  };

  const run = () => {
    if (done) return;
    done = true;
    clearPending();
    // Let the frame that shows the first content paint before the work starts.
    frame = window.requestAnimationFrame(() => {
      frame = null;
      timer = window.setTimeout(() => {
        timer = null;
        task();
      }, 0);
    });
  };

  function check() {
    if (done) return;
    const delayMs = resolveStartupGateDelayMs({
      nowMs: typeof performance !== "undefined" ? performance.now() : STARTUP_HARD_CAP_MS,
      loaded: document.readyState === "complete",
      contentReady,
    });
    if (delayMs === 0) {
      run();
      return;
    }
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(check, delayMs);
  }

  window.addEventListener("load", check);
  contentReadyListeners.add(check);
  check();

  return () => {
    done = true;
    clearPending();
    if (frame !== null) window.cancelAnimationFrame(frame);
    frame = null;
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
  };
}

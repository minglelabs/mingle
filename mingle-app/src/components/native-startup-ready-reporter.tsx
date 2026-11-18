"use client";

import { useEffect } from "react";

// Tells the native shell when the first screen is really drawn, so its startup
// splash (logo + loading line) can stay up until then. Without it the splash
// came down at onLoadEnd, which only means the HTML is in: the web's own
// loading shell, a spinner or a blank page showed next, and only then the UI.
//
// "Drawn" = the page has text on screen and no loading indicator is visible
// in the viewport (a spinner, an aria-busy region, or anything marked
// data-startup-busy) for a few polls in a row. A page that never settles
// still reports after STARTUP_READY_MAX_MS; the native side has its own cap.

const POLL_INTERVAL_MS = 100;
const STABLE_POLLS = 3;
const STARTUP_READY_MAX_MS = 10000;
const BUSY_SELECTOR = ".animate-spin, [aria-busy='true'], [data-startup-busy]";

type NativeBridgeWindow = Window & {
  ReactNativeWebView?: { postMessage?: (message: string) => void };
};

let reportedThisDocument = false;

function isShownInViewport(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  if (rect.bottom <= 0 || rect.right <= 0 || rect.top >= viewportHeight || rect.left >= viewportWidth) {
    return false;
  }
  const checkVisibility = (element as Element & {
    checkVisibility?: (options?: { opacityProperty?: boolean; visibilityProperty?: boolean }) => boolean;
  }).checkVisibility;
  if (typeof checkVisibility === "function") {
    return checkVisibility.call(element, { opacityProperty: true, visibilityProperty: true });
  }
  const style = window.getComputedStyle(element);
  return style.visibility !== "hidden" && style.display !== "none" && style.opacity !== "0";
}

function isStartupScreenSettled(): boolean {
  const body = document.body;
  if (!body || body.innerText.trim().length === 0) return false;
  for (const element of Array.from(document.querySelectorAll(BUSY_SELECTOR))) {
    if (isShownInViewport(element)) return false;
  }
  return true;
}

function postUiReady(): void {
  const bridge = (window as NativeBridgeWindow).ReactNativeWebView;
  if (typeof bridge?.postMessage !== "function") return;
  try {
    bridge.postMessage(JSON.stringify({ type: "native_web_ui_ready" }));
  } catch {
    // Older shells ignore unknown commands anyway.
  }
}

export default function NativeStartupReadyReporter() {
  useEffect(() => {
    if (reportedThisDocument) return;
    if (typeof (window as NativeBridgeWindow).ReactNativeWebView?.postMessage !== "function") return;

    let cancelled = false;
    let timer: number | null = null;
    let stablePolls = 0;
    const startedAtMs = Date.now();

    const report = () => {
      if (cancelled || reportedThisDocument) return;
      reportedThisDocument = true;
      // Wait for the settled frame to be painted before the splash lifts.
      requestAnimationFrame(() => requestAnimationFrame(postUiReady));
    };

    const poll = () => {
      timer = null;
      if (cancelled) return;
      stablePolls = isStartupScreenSettled() ? stablePolls + 1 : 0;
      if (stablePolls >= STABLE_POLLS || Date.now() - startedAtMs >= STARTUP_READY_MAX_MS) {
        report();
        return;
      }
      timer = window.setTimeout(poll, POLL_INTERVAL_MS);
    };

    poll();
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, []);

  return null;
}

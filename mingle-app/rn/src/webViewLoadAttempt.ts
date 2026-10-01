// Decides when a WebView page load has actually SUCCEEDED.
//
// onLoadEnd alone cannot tell success from failure, because the callback order
// for a failed load differs per platform (react-native-webview 13.x):
// - iOS: onLoadStart when the navigation begins; for a failure onError (or
//   onHttpError) arrives first, then onLoadEnd.
// - Android: RNCWebViewClient.onReceivedError dispatches a "loading finish"
//   event BEFORE the error event (to mimic iOS), so JS sees
//   onLoadEnd -> onError -> onLoadEnd for one failed load. Both events come out
//   of that single native callback back to back, so the error always reaches
//   JS right behind the premature onLoadEnd.
// - Android also emits onLoadStart only from doUpdateVisitedHistory, i.e. when
//   a navigation COMMITS (same-document history changes included). For an
//   HTTP error page that is after onHttpError, and a failed load's error page
//   commits after onError.
//
// Hence:
// - a finished load is only committed as a success once it is clear no error
//   followed it: after a short settle window, or as soon as any later load
//   event arrives (only the error Android dispatches right behind a premature
//   onLoadEnd can disprove it);
// - a failure sticks until the next attempt, which is a WebView remount
//   (retry). onLoadStart must not clear it: on Android it
//   belongs to the very load that failed, and after any failure the error
//   overlay covers the WebView until the user retries anyway.
export const WEBVIEW_LOAD_SUCCESS_SETTLE_MS = 300;

// How long a retried load may stay silent before the "reconnecting"
// spinner turns back into the error overlay with its retry button. Some loads
// never report back at all (iOS drops failures after the navigation committed,
// since react-native-webview has no didFailNavigation handler; a hung
// connection), and the spinner must not trap the user. A late success still
// clears the overlay through the tracker.
export const WEBVIEW_RETRY_STALL_TIMEOUT_MS = 30_000;

type TimerHandle = ReturnType<typeof setTimeout>;

export type WebViewLoadAttemptTracker = {
  /** A new WebView instance mounted (retry, debug remount). */
  beginAttempt: () => void;
  /** onLoadStart. Confirms a pending finish; does NOT clear a failure. */
  loadStarted: () => void;
  /** onLoadEnd. A success only if no error follows. */
  loadFinished: () => void;
  /** onError / onHttpError / render-process death. Sticks until beginAttempt(). */
  loadFailed: () => void;
  /** Whether the current attempt has reported a failure. */
  hasFailed: () => boolean;
  /** Whether any attempt so far has been committed as a success. */
  hasLoadedPage: () => boolean;
  /** Drops a pending commit (on unmount). */
  dispose: () => void;
};

export function createWebViewLoadAttemptTracker(options: {
  onSuccess: () => void;
  settleMs?: number;
  setTimer?: (callback: () => void, ms: number) => TimerHandle;
  clearTimer?: (handle: TimerHandle) => void;
}): WebViewLoadAttemptTracker {
  const settleMs = options.settleMs ?? WEBVIEW_LOAD_SUCCESS_SETTLE_MS;
  const setTimer = options.setTimer ?? ((callback, ms) => setTimeout(callback, ms));
  const clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle));

  let attemptFailed = false;
  let loadedPage = false;
  let pendingCommit: TimerHandle | null = null;

  const cancelPendingCommit = () => {
    if (pendingCommit === null) return;
    clearTimer(pendingCommit);
    pendingCommit = null;
  };

  const commitSuccess = () => {
    cancelPendingCommit();
    loadedPage = true;
    options.onSuccess();
  };

  const confirmPendingCommit = () => {
    if (pendingCommit !== null) commitSuccess();
  };

  return {
    beginAttempt: () => {
      confirmPendingCommit();
      attemptFailed = false;
    },
    loadStarted: confirmPendingCommit,
    loadFinished: () => {
      if (attemptFailed) return;
      confirmPendingCommit();
      pendingCommit = setTimer(() => {
        pendingCommit = null;
        commitSuccess();
      }, settleMs);
    },
    loadFailed: () => {
      attemptFailed = true;
      cancelPendingCommit();
    },
    hasFailed: () => attemptFailed,
    hasLoadedPage: () => loadedPage,
    dispose: cancelPendingCommit,
  };
}

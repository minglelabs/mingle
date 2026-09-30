// Decides when a WebView page load has actually SUCCEEDED.
//
// onLoadEnd alone cannot tell success from failure, because the callback order
// for a failed load differs per platform (react-native-webview 13.x):
// - iOS: onError (or onHttpError) arrives first, then onLoadEnd.
// - Android: RNCWebViewClient.onReceivedError dispatches a "loading finish"
//   event BEFORE the error event (to mimic iOS), so JS sees
//   onLoadEnd -> onError -> onLoadEnd for one failed load. Both events come out
//   of that single native callback back to back, so the error always reaches
//   JS right behind the premature onLoadEnd.
//
// Android also emits onLoadStart from doUpdateVisitedHistory, i.e. only once
// a navigation commits (same-document history changes included), so a failed
// load may have no onLoadStart before its onLoadEnd at all.
//
// So a finished load is only committed as a success once it is clear no error
// followed it: after a short settle window, or as soon as any later load event
// (onLoadStart or another onLoadEnd) arrives. Only a failure cancels it.
export const WEBVIEW_LOAD_SUCCESS_SETTLE_MS = 300;

type TimerHandle = ReturnType<typeof setTimeout>;

export type WebViewLoadAttemptTracker = {
  /** onLoadStart: a new navigation attempt began. */
  start: () => void;
  /** onLoadEnd: the attempt finished — a success only if no error follows. */
  finish: () => void;
  /** onError / onHttpError / render-process death for the current attempt. */
  fail: () => void;
  /** Whether the current attempt has already reported a failure. */
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

  // The only thing that can disprove a pending finish is the error Android
  // dispatches right behind it. Any other load event arriving first means that
  // error is not coming, so the finish was a real success.
  const confirmPendingCommit = () => {
    if (pendingCommit !== null) commitSuccess();
  };

  return {
    start: () => {
      confirmPendingCommit();
      attemptFailed = false;
    },
    finish: () => {
      if (attemptFailed) return;
      confirmPendingCommit();
      pendingCommit = setTimer(() => {
        pendingCommit = null;
        commitSuccess();
      }, settleMs);
    },
    fail: () => {
      attemptFailed = true;
      cancelPendingCommit();
    },
    hasFailed: () => attemptFailed,
    hasLoadedPage: () => loadedPage,
    dispose: cancelPendingCommit,
  };
}

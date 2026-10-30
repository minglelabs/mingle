import {
  WEBVIEW_LOAD_SUCCESS_SETTLE_MS,
  createWebViewLoadAttemptTracker,
  type WebViewLoadAttemptTracker,
} from '../src/webViewLoadAttempt';

// Sampled at the moment onError / onHttpError fires: has no page been
// committed as a success so far?
function noPageLoadedYet(tracker: WebViewLoadAttemptTracker): boolean {
  return !tracker.hasLoadedPage();
}

// The callbacks App.tsx forwards, in react-native-webview 13.16's order.
// Android emits onLoadStart only from doUpdateVisitedHistory (navigation
// commit), and onReceivedError dispatches a finish event BEFORE the error.
// `gapMs` delays the error behind the premature onLoadEnd.
function androidNetworkFailure(tracker: WebViewLoadAttemptTracker, gapMs = 0): boolean {
  tracker.loadFinished(); // onLoadEnd before onError
  jest.advanceTimersByTime(gapMs);
  tracker.loadFailed(); // onError
  const nothingLoadedYet = noPageLoadedYet(tracker);
  tracker.loadFinished(); // onLoadEnd again, right after onError
  tracker.loadStarted(); // onLoadStart: the error page commits
  return nothingLoadedYet;
}

function androidHttpFailure(tracker: WebViewLoadAttemptTracker): boolean {
  tracker.loadFailed(); // onHttpError (response headers)
  const nothingLoadedYet = noPageLoadedYet(tracker);
  tracker.loadStarted(); // onLoadStart: the error document commits
  tracker.loadFinished(); // onLoadEnd: onPageFinished for the error document
  return nothingLoadedYet;
}

function iosFailure(tracker: WebViewLoadAttemptTracker): boolean {
  tracker.loadStarted(); // onLoadStart
  tracker.loadFailed(); // onError / onHttpError
  const nothingLoadedYet = noPageLoadedYet(tracker);
  tracker.loadFinished(); // onLoadEnd
  return nothingLoadedYet;
}

describe('createWebViewLoadAttemptTracker', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not count an Android failed load as a success, also across retries', () => {
    const onSuccess = jest.fn();
    const tracker = createWebViewLoadAttemptTracker({ onSuccess });

    // First load: the host times out.
    expect(androidNetworkFailure(tracker)).toBe(true);
    jest.advanceTimersByTime(WEBVIEW_LOAD_SUCCESS_SETTLE_MS * 10);
    expect(tracker.hasLoadedPage()).toBe(false);

    // "다시 시도" remounts the WebView (App.tsx calls beginAttempt()) and hits
    // the same dead host.
    tracker.beginAttempt();
    expect(androidNetworkFailure(tracker)).toBe(true);
    tracker.beginAttempt();
    expect(androidNetworkFailure(tracker, WEBVIEW_LOAD_SUCCESS_SETTLE_MS - 1)).toBe(true);
    jest.advanceTimersByTime(WEBVIEW_LOAD_SUCCESS_SETTLE_MS * 10);
    expect(tracker.hasLoadedPage()).toBe(false);
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('keeps an Android HTTP error page failed after it commits and finishes loading', () => {
    const onSuccess = jest.fn();
    const tracker = createWebViewLoadAttemptTracker({ onSuccess });

    expect(androidHttpFailure(tracker)).toBe(true);
    jest.advanceTimersByTime(WEBVIEW_LOAD_SUCCESS_SETTLE_MS * 10);
    expect(tracker.hasFailed()).toBe(true);
    expect(tracker.hasLoadedPage()).toBe(false);
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('does not count an iOS failed load as a success', () => {
    const onSuccess = jest.fn();
    const tracker = createWebViewLoadAttemptTracker({ onSuccess });

    expect(iosFailure(tracker)).toBe(true);
    jest.advanceTimersByTime(WEBVIEW_LOAD_SUCCESS_SETTLE_MS * 10);
    expect(tracker.hasFailed()).toBe(true);
    expect(tracker.hasLoadedPage()).toBe(false);
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('commits a clean load once the settle window passes', () => {
    const onSuccess = jest.fn();
    const tracker = createWebViewLoadAttemptTracker({ onSuccess });

    tracker.loadStarted();
    tracker.loadFinished();
    jest.advanceTimersByTime(WEBVIEW_LOAD_SUCCESS_SETTLE_MS - 1);
    expect(tracker.hasLoadedPage()).toBe(false);
    expect(onSuccess).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(tracker.hasLoadedPage()).toBe(true);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(noPageLoadedYet(tracker)).toBe(false);
  });

  it('commits a clean load as soon as another load event shows no error followed it', () => {
    const onSuccess = jest.fn();
    const tracker = createWebViewLoadAttemptTracker({ onSuccess });

    // e.g. a same-document route change, which Android reports as onLoadStart.
    tracker.loadStarted();
    tracker.loadFinished();
    tracker.loadStarted();
    expect(tracker.hasLoadedPage()).toBe(true);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(WEBVIEW_LOAD_SUCCESS_SETTLE_MS * 10);
    expect(onSuccess).toHaveBeenCalledTimes(1);

    // A clean load right before a failing navigation that has no onLoadStart
    // of its own still counts.
    const second = createWebViewLoadAttemptTracker({ onSuccess: jest.fn() });
    second.loadStarted();
    second.loadFinished();
    expect(androidNetworkFailure(second)).toBe(false);
  });

  it('keeps an earlier success when a later load fails, and shows that failure until a remount', () => {
    const tracker = createWebViewLoadAttemptTracker({ onSuccess: jest.fn() });

    tracker.loadStarted();
    tracker.loadFinished();
    jest.advanceTimersByTime(WEBVIEW_LOAD_SUCCESS_SETTLE_MS);
    expect(androidHttpFailure(tracker)).toBe(false);
    expect(tracker.hasFailed()).toBe(true);
    expect(androidNetworkFailure(tracker)).toBe(false);
    expect(iosFailure(tracker)).toBe(false);

    tracker.beginAttempt();
    expect(tracker.hasFailed()).toBe(false);
  });

  it('drops a pending commit when the render process dies or the tracker is disposed', () => {
    const onSuccess = jest.fn();
    const tracker = createWebViewLoadAttemptTracker({ onSuccess });

    tracker.loadStarted();
    tracker.loadFinished();
    tracker.loadFailed(); // onRenderProcessGone / onContentProcessDidTerminate
    jest.advanceTimersByTime(WEBVIEW_LOAD_SUCCESS_SETTLE_MS * 10);
    expect(tracker.hasLoadedPage()).toBe(false);

    tracker.beginAttempt();
    tracker.loadStarted();
    tracker.loadFinished();
    tracker.dispose();
    jest.advanceTimersByTime(WEBVIEW_LOAD_SUCCESS_SETTLE_MS * 10);
    expect(tracker.hasLoadedPage()).toBe(false);
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('commits a retried load that succeeds after a failure', () => {
    const onSuccess = jest.fn();
    const tracker = createWebViewLoadAttemptTracker({ onSuccess });

    expect(androidNetworkFailure(tracker)).toBe(true);
    tracker.beginAttempt(); // retry remount
    tracker.loadStarted();
    tracker.loadFinished();
    jest.advanceTimersByTime(WEBVIEW_LOAD_SUCCESS_SETTLE_MS);
    expect(tracker.hasLoadedPage()).toBe(true);
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });
});

import { canUseWebHostFallbackForLoadFailure } from '../src/fallbackTargets';
import {
  WEBVIEW_LOAD_SUCCESS_SETTLE_MS,
  createWebViewLoadAttemptTracker,
  type WebViewLoadAttemptTracker,
} from '../src/webViewLoadAttempt';

// What App.tsx asks inside onError. initialLoadSettled is true on purpose: on
// Android the premature onLoadEnd has already settled the initial load by the
// time onError arrives, so only hasLoadedPage can keep the fallback open.
function mayUseHostFallback(tracker: WebViewLoadAttemptTracker): boolean {
  return canUseWebHostFallbackForLoadFailure({
    initialLoadSettled: true,
    hasLoadedPage: tracker.hasLoadedPage(),
  });
}

// One failed load as App.tsx sees it on Android with react-native-webview
// 13.16: onReceivedError dispatches a finish event BEFORE the error event, and
// onLoadStart only comes from doUpdateVisitedHistory, i.e. when the error page
// commits AFTER the error. `gapMs` delays the error behind the early onLoadEnd.
function androidFailedLoad(tracker: WebViewLoadAttemptTracker, gapMs = 0): boolean {
  tracker.finish(); // onLoadEnd before onError
  jest.advanceTimersByTime(gapMs);
  tracker.fail(); // onError
  const fallbackAllowed = mayUseHostFallback(tracker);
  tracker.finish(); // onLoadEnd again, right after onError
  tracker.start(); // onLoadStart for the committed error page
  return fallbackAllowed;
}

function iosFailedLoad(tracker: WebViewLoadAttemptTracker): boolean {
  tracker.start(); // onLoadStart
  tracker.fail(); // onError / onHttpError
  const fallbackAllowed = mayUseHostFallback(tracker);
  tracker.finish(); // onLoadEnd
  return fallbackAllowed;
}

describe('createWebViewLoadAttemptTracker', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not count an Android failed load as a success, so retries can still fall back', () => {
    const onSuccess = jest.fn();
    const tracker = createWebViewLoadAttemptTracker({ onSuccess });

    // First load: the primary host times out.
    expect(androidFailedLoad(tracker)).toBe(true);
    jest.advanceTimersByTime(WEBVIEW_LOAD_SUCCESS_SETTLE_MS * 10);
    expect(tracker.hasLoadedPage()).toBe(false);

    // "다시 시도" remounts the WebView (App.tsx calls start() for the new
    // instance) and hits the same dead host: the fallback must stay reachable.
    tracker.start();
    expect(androidFailedLoad(tracker)).toBe(true);
    tracker.start();
    expect(androidFailedLoad(tracker, WEBVIEW_LOAD_SUCCESS_SETTLE_MS - 1)).toBe(true);
    jest.advanceTimersByTime(WEBVIEW_LOAD_SUCCESS_SETTLE_MS * 10);
    expect(tracker.hasLoadedPage()).toBe(false);
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('does not count an iOS failed load (error before onLoadEnd) as a success', () => {
    const onSuccess = jest.fn();
    const tracker = createWebViewLoadAttemptTracker({ onSuccess });

    expect(iosFailedLoad(tracker)).toBe(true);
    expect(tracker.hasFailed()).toBe(true);
    jest.advanceTimersByTime(WEBVIEW_LOAD_SUCCESS_SETTLE_MS * 10);
    expect(tracker.hasLoadedPage()).toBe(false);
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('commits a clean load once the settle window passes', () => {
    const onSuccess = jest.fn();
    const tracker = createWebViewLoadAttemptTracker({ onSuccess });

    tracker.start();
    tracker.finish();
    jest.advanceTimersByTime(WEBVIEW_LOAD_SUCCESS_SETTLE_MS - 1);
    expect(tracker.hasLoadedPage()).toBe(false);
    expect(onSuccess).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(tracker.hasLoadedPage()).toBe(true);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    // A page has loaded from this host: never switch hosts mid-session.
    expect(mayUseHostFallback(tracker)).toBe(false);
  });

  it('commits a clean load as soon as another load event shows no error followed it', () => {
    const onSuccess = jest.fn();
    const tracker = createWebViewLoadAttemptTracker({ onSuccess });

    // A same-document route change (Android reports it as onLoadStart).
    tracker.start();
    tracker.finish();
    tracker.start();
    expect(tracker.hasLoadedPage()).toBe(true);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(WEBVIEW_LOAD_SUCCESS_SETTLE_MS * 10);
    expect(onSuccess).toHaveBeenCalledTimes(1);

    // A clean load immediately followed by a failing navigation that has no
    // onLoadStart of its own: the first load still counts.
    const second = createWebViewLoadAttemptTracker({ onSuccess: jest.fn() });
    second.start();
    second.finish();
    expect(androidFailedLoad(second)).toBe(false);
  });

  it('keeps an earlier success when a later load fails', () => {
    const tracker = createWebViewLoadAttemptTracker({ onSuccess: jest.fn() });

    tracker.start();
    tracker.finish();
    jest.advanceTimersByTime(WEBVIEW_LOAD_SUCCESS_SETTLE_MS);
    expect(androidFailedLoad(tracker)).toBe(false);
    expect(iosFailedLoad(tracker)).toBe(false);
  });

  it('drops a pending commit when the render process dies or the tracker is disposed', () => {
    const onSuccess = jest.fn();
    const tracker = createWebViewLoadAttemptTracker({ onSuccess });

    tracker.start();
    tracker.finish();
    tracker.fail(); // onRenderProcessGone / onContentProcessDidTerminate
    jest.advanceTimersByTime(WEBVIEW_LOAD_SUCCESS_SETTLE_MS * 10);
    expect(tracker.hasLoadedPage()).toBe(false);

    tracker.start();
    tracker.finish();
    tracker.dispose();
    jest.advanceTimersByTime(WEBVIEW_LOAD_SUCCESS_SETTLE_MS * 10);
    expect(tracker.hasLoadedPage()).toBe(false);
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('reports a failed attempt until the next attempt starts', () => {
    const tracker = createWebViewLoadAttemptTracker({ onSuccess: jest.fn() });

    tracker.start();
    expect(tracker.hasFailed()).toBe(false);
    tracker.fail();
    tracker.finish();
    expect(tracker.hasFailed()).toBe(true);
    tracker.start();
    expect(tracker.hasFailed()).toBe(false);
  });
});

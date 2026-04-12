export const NATIVE_NAV_INDEX_KEY = "__MINGLE_NATIVE_NAV_INDEX__";
export const NATIVE_NAV_RAW_STATE_KEY = "__MINGLE_NATIVE_NAV_RAW_STATE__";

export function isMergeableNavigationState(state: unknown): state is Record<string, unknown> {
  return state !== null && typeof state === "object" && !Array.isArray(state);
}

export function readNativeNavigationHistoryIndex(state: unknown): number | null {
  if (!isMergeableNavigationState(state)) {
    return null;
  }
  const value = state[NATIVE_NAV_INDEX_KEY];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return Math.max(0, Math.floor(value));
}

export function stampNativeNavigationHistoryState(state: unknown, index: number): Record<string, unknown> {
  const normalizedIndex = Math.max(0, Math.floor(index));

  if (isMergeableNavigationState(state)) {
    const nextState: Record<string, unknown> = {};
    for (const key of Object.keys(state)) {
      if (key === NATIVE_NAV_INDEX_KEY) continue;
      nextState[key] = state[key];
    }
    nextState[NATIVE_NAV_INDEX_KEY] = normalizedIndex;
    return nextState;
  }

  return {
    [NATIVE_NAV_INDEX_KEY]: normalizedIndex,
    [NATIVE_NAV_RAW_STATE_KEY]: typeof state === "undefined" ? null : state,
  };
}

export function resolveNativeNavigationCanGoBack(currentHistoryIndex: number): boolean {
  return currentHistoryIndex > 0;
}

export function resolveNextNativeNavigationHistoryIndex(
  currentHistoryIndex: number,
  methodName: "pushState" | "replaceState",
): number {
  return methodName === "pushState"
    ? currentHistoryIndex + 1
    : currentHistoryIndex;
}

export function buildNativeNavigationBridgeScript(): string {
  return `
  (function () {
    if (window.__MINGLE_NATIVE_NAV_BRIDGE_INSTALLED__) {
      return true;
    }
    window.__MINGLE_NATIVE_NAV_BRIDGE_INSTALLED__ = true;

    var NATIVE_NAV_INDEX_KEY = '${NATIVE_NAV_INDEX_KEY}';
    var NATIVE_NAV_RAW_STATE_KEY = '${NATIVE_NAV_RAW_STATE_KEY}';
    var currentHistoryIndex = 0;

    var isMergeableState = function (state) {
      return state !== null && typeof state === 'object' && !Array.isArray(state);
    };

    var readHistoryIndex = function (state) {
      if (!state || typeof state !== 'object') {
        return null;
      }
      var value = state[NATIVE_NAV_INDEX_KEY];
      if (typeof value !== 'number' || !isFinite(value)) {
        return null;
      }
      return Math.max(0, Math.floor(value));
    };

    var stampHistoryState = function (state, index) {
      if (isMergeableState(state)) {
        var nextState = {};
        for (var key in state) {
          if (Object.prototype.hasOwnProperty.call(state, key) && key !== NATIVE_NAV_INDEX_KEY) {
            nextState[key] = state[key];
          }
        }
        nextState[NATIVE_NAV_INDEX_KEY] = index;
        return nextState;
      }

      var wrappedState = {};
      wrappedState[NATIVE_NAV_INDEX_KEY] = index;
      wrappedState[NATIVE_NAV_RAW_STATE_KEY] = typeof state === 'undefined' ? null : state;
      return wrappedState;
    };

    var ensureStampedCurrentEntry = function (fallbackIndex) {
      currentHistoryIndex = fallbackIndex;
      try {
        window.history.replaceState(
          stampHistoryState(window.history.state, currentHistoryIndex),
          '',
          window.location.href
        );
      } catch (error) {
        // Ignore replaceState failures on locked-down history entries.
      }
    };

    var postCurrentUrl = function () {
      var bridge = window.ReactNativeWebView;
      if (!bridge || typeof bridge.postMessage !== 'function') {
        return;
      }
      try {
        bridge.postMessage(JSON.stringify({
          type: 'native_navigation_state',
          payload: {
            url: window.location.href,
            canGoBack: currentHistoryIndex > 0,
          }
        }));
      } catch (error) {
        // Ignore bridge serialization failures.
      }
    };

    var wrapHistoryMethod = function (methodName) {
      var original = window.history[methodName];
      if (typeof original !== 'function') {
        return;
      }
      window.history[methodName] = function () {
        var nextIndex = methodName === 'pushState'
          ? currentHistoryIndex + 1
          : currentHistoryIndex;
        var nextArgs = [];
        nextArgs[0] = stampHistoryState(arguments[0], nextIndex);
        for (var argumentIndex = 1; argumentIndex < arguments.length; argumentIndex += 1) {
          nextArgs[argumentIndex] = arguments[argumentIndex];
        }
        var result = original.apply(window.history, nextArgs);
        currentHistoryIndex = nextIndex;
        postCurrentUrl();
        return result;
      };
    };

    var initialHistoryIndex = readHistoryIndex(window.history.state);
    if (initialHistoryIndex === null) {
      ensureStampedCurrentEntry(0);
    } else {
      currentHistoryIndex = initialHistoryIndex;
    }

    wrapHistoryMethod('pushState');
    wrapHistoryMethod('replaceState');
    window.addEventListener('popstate', function (event) {
      var nextIndex = readHistoryIndex(event && event.state);
      if (nextIndex === null) {
        nextIndex = readHistoryIndex(window.history.state);
      }
      if (nextIndex === null) {
        ensureStampedCurrentEntry(0);
      } else {
        currentHistoryIndex = nextIndex;
      }
      postCurrentUrl();
    });
    window.addEventListener('hashchange', postCurrentUrl);
    postCurrentUrl();
    return true;
  })();
`;
}

export const WEBVIEW_NAVIGATION_BRIDGE_SCRIPT = buildNativeNavigationBridgeScript();

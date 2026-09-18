export const NATIVE_HISTORY_BACK_ANIMATE_FLAG = "__MINGLE_NATIVE_HISTORY_CLOSE_ANIMATE__";

const NATIVE_BACK_HANDLER_KEY = "__MINGLE_NATIVE_BACK_HANDLER_STACK__";
const NATIVE_BACK_DISPATCHER_KEY = "__MINGLE_HANDLE_NATIVE_BACK__";
const NATIVE_BACK_ORDER_KEY = "__MINGLE_NATIVE_BACK_HANDLER_ORDER__";

export type NativeBackHandler = () => boolean;

type NativeBackHandlerEntry = {
  handler: NativeBackHandler;
  priority: number;
  order: number;
};

type NativeBackHandlerWindow = Window & {
  [NATIVE_BACK_HANDLER_KEY]?: NativeBackHandlerEntry[];
  [NATIVE_BACK_DISPATCHER_KEY]?: () => boolean;
  [NATIVE_BACK_ORDER_KEY]?: number;
  [NATIVE_HISTORY_BACK_ANIMATE_FLAG]?: boolean;
  ReactNativeWebView?: {
    postMessage?: (message: string) => void;
  };
};

function resolveNativeBackHandlerWindow(): NativeBackHandlerWindow | null {
  if (typeof window === "undefined") return null;
  return window as NativeBackHandlerWindow;
}

function dispatchNativeBack(bridgeWindow: NativeBackHandlerWindow): boolean {
  const nextHandlers = bridgeWindow[NATIVE_BACK_HANDLER_KEY];
  if (!Array.isArray(nextHandlers)) return false;

  const orderedHandlers = [...nextHandlers].sort((left, right) => (
    right.priority - left.priority || right.order - left.order
  ));

  for (const entry of orderedHandlers) {
    try {
      if (entry.handler()) return true;
    } catch {
      continue;
    }
  }

  return false;
}

function ensureNativeBackDispatcher(bridgeWindow: NativeBackHandlerWindow): NativeBackHandlerEntry[] {
  const existingHandlers = bridgeWindow[NATIVE_BACK_HANDLER_KEY];
  if (Array.isArray(existingHandlers)) {
    if (typeof bridgeWindow[NATIVE_BACK_DISPATCHER_KEY] !== "function") {
      bridgeWindow[NATIVE_BACK_DISPATCHER_KEY] = () => dispatchNativeBack(bridgeWindow);
    }
    return existingHandlers;
  }

  const handlers: NativeBackHandlerEntry[] = [];
  bridgeWindow[NATIVE_BACK_HANDLER_KEY] = handlers;
  bridgeWindow[NATIVE_BACK_DISPATCHER_KEY] = () => dispatchNativeBack(bridgeWindow);
  return handlers;
}

export function registerNativeBackHandler(
  handler: NativeBackHandler,
  priority = 0,
): () => void {
  const bridgeWindow = resolveNativeBackHandlerWindow();
  if (!bridgeWindow) return () => {};

  const handlers = ensureNativeBackDispatcher(bridgeWindow);
  const nextOrder = bridgeWindow[NATIVE_BACK_ORDER_KEY] ?? 0;
  const nextEntry: NativeBackHandlerEntry = {
    handler,
    priority,
    order: nextOrder,
  };
  handlers.push(nextEntry);
  bridgeWindow[NATIVE_BACK_ORDER_KEY] = nextOrder + 1;

  return () => {
    const nextHandlers = bridgeWindow[NATIVE_BACK_HANDLER_KEY];
    if (!Array.isArray(nextHandlers)) return;
    const handlerIndex = nextHandlers.lastIndexOf(nextEntry);
    if (handlerIndex < 0) return;
    nextHandlers.splice(handlerIndex, 1);
  };
}

export function postNativeAndroidBackCapability(canHandleAndroidBack: boolean): void {
  const bridgeWindow = resolveNativeBackHandlerWindow();
  const postMessage = bridgeWindow?.ReactNativeWebView?.postMessage;
  if (!bridgeWindow || typeof postMessage !== "function") return;

  try {
    bridgeWindow.ReactNativeWebView?.postMessage(JSON.stringify({
      type: "native_navigation_state",
      payload: {
        canHandleAndroidBack,
        url: bridgeWindow.location.href,
      },
    }));
  } catch {
    // Keep browser navigation unchanged when the native bridge is unavailable.
  }
}

export function clearNativeHistoryBackAnimateFlag(): void {
  const bridgeWindow = resolveNativeBackHandlerWindow();
  if (!bridgeWindow) return;
  bridgeWindow[NATIVE_HISTORY_BACK_ANIMATE_FLAG] = false;
}

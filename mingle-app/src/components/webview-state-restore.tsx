"use client";

import { useSession } from "next-auth/react";
import { useEffect, useRef } from "react";
import { clearDurableFeedRestoreStates } from "@/components/feed/feed-restore-state";
import {
  RESTORE_SCROLL_DEFAULT_ATTRIBUTE,
  applySavedScrollPosition,
  captureWebViewStateSnapshot,
  clearStoredWebViewStateSnapshot,
  findRestoreScrollContainer,
  parseWebViewStateSnapshot,
  readStoredWebViewStateSnapshot,
  resolveWebViewStateScreenKey,
  shouldRestoreScrollPosition,
  storeWebViewStateSnapshot,
  type SavedScrollPosition,
} from "@/lib/webview-state-restore";

const NATIVE_UI_EVENT = "mingle:native-ui";
const RESTORE_POLL_INTERVAL_MS = 120;
const RESTORE_MAX_DURATION_MS = 6000;
// The position must hold this many polls in a row: late data can still push it.
const RESTORE_STABLE_POLLS = 3;

type NativeBridgeWindow = Window & {
  ReactNativeWebView?: { postMessage?: (message: string) => void };
};

function postNativeCommand(type: "native_web_restore_ready" | "native_web_restore_reset"): void {
  const bridge = (window as NativeBridgeWindow).ReactNativeWebView;
  if (typeof bridge?.postMessage !== "function") return;
  try {
    bridge.postMessage(JSON.stringify({ type }));
  } catch {
    // Older shells ignore unknown commands anyway.
  }
}

function isNativeWebView(): boolean {
  return typeof (window as NativeBridgeWindow).ReactNativeWebView?.postMessage === "function";
}

// Re-applies saved scroll positions until each holds, the user takes over, or
// time runs out. Returns a cancel function.
function runScrollRestore(scroll: Record<string, SavedScrollPosition>, onDone: () => void): () => void {
  const pending = new Map<string, { position: SavedScrollPosition; stablePolls: number }>();
  for (const [key, position] of Object.entries(scroll)) {
    pending.set(key, { position, stablePolls: 0 });
  }

  let finished = false;
  let timer: number | null = null;
  const startedAtMs = Date.now();
  const finish = () => {
    if (finished) return;
    finished = true;
    if (timer !== null) window.clearTimeout(timer);
    document.removeEventListener("touchstart", finish, true);
    document.removeEventListener("wheel", finish, true);
    document.removeEventListener("keydown", finish, true);
    onDone();
  };
  // Never fight the user for the scroll position.
  document.addEventListener("touchstart", finish, true);
  document.addEventListener("wheel", finish, true);
  document.addEventListener("keydown", finish, true);

  const poll = () => {
    timer = null;
    if (finished) return;
    for (const [key, entry] of pending) {
      const container = findRestoreScrollContainer(key);
      if (!container) continue;
      const defaultsToEnd = container.getAttribute(RESTORE_SCROLL_DEFAULT_ATTRIBUTE) === "end";
      if (!shouldRestoreScrollPosition(entry.position, defaultsToEnd)) {
        pending.delete(key);
        continue;
      }
      const step = applySavedScrollPosition(container, entry.position);
      if (step === "skip") {
        pending.delete(key);
      } else if (step === "applied") {
        entry.stablePolls += 1;
        if (entry.stablePolls >= RESTORE_STABLE_POLLS) pending.delete(key);
      } else {
        entry.stablePolls = 0;
      }
    }
    if (pending.size === 0 || Date.now() - startedAtMs >= RESTORE_MAX_DURATION_MS) {
      finish();
      return;
    }
    timer = window.setTimeout(poll, RESTORE_POLL_INTERVAL_MS);
  };
  poll();

  return finish;
}

export default function WebViewStateRestore() {
  const { data: session, status } = useSession();
  const accountKey = status === "authenticated" && typeof session?.user?.id === "string"
    ? session.user.id.trim()
    : "";
  const accountKeyRef = useRef(accountKey);
  const restoreHandledRef = useRef(false);
  const previousAccountKeyRef = useRef<string | null>(null);

  useEffect(() => {
    accountKeyRef.current = accountKey;
  }, [accountKey]);

  // Signing out or switching accounts must never reopen (or show a capture
  // of) the previous account's screen.
  useEffect(() => {
    if (status === "loading") return;
    const previousAccountKey = previousAccountKeyRef.current;
    previousAccountKeyRef.current = accountKey;
    if (previousAccountKey === accountKey) return;
    if (previousAccountKey === null && accountKey) return;
    clearStoredWebViewStateSnapshot();
    clearDurableFeedRestoreStates();
    postNativeCommand("native_web_restore_reset");
  }, [accountKey, status]);

  // Restore once per document: only a fresh load can follow an OS kill.
  useEffect(() => {
    if (status === "loading" || restoreHandledRef.current) return;
    restoreHandledRef.current = true;
    if (!isNativeWebView()) return;

    const snapshot = parseWebViewStateSnapshot(readStoredWebViewStateSnapshot(), {
      nowMs: Date.now(),
      accountKey,
      screenKey: resolveWebViewStateScreenKey(window.location.href),
    });
    if (!snapshot || Object.keys(snapshot.scroll).length === 0) {
      postNativeCommand("native_web_restore_ready");
      return;
    }
    return runScrollRestore(snapshot.scroll, () => postNativeCommand("native_web_restore_ready"));
  }, [accountKey, status]);

  useEffect(() => {
    if (!isNativeWebView()) return;
    const save = () => {
      const snapshot = captureWebViewStateSnapshot({
        nowMs: Date.now(),
        accountKey: accountKeyRef.current,
        href: window.location.href,
      });
      if (snapshot) storeWebViewStateSnapshot(snapshot);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") save();
    };
    const handleNativeUiEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ type?: string; state?: string }>).detail;
      if (detail?.type === "app_lifecycle" && detail.state === "background") save();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", save);
    window.addEventListener(NATIVE_UI_EVENT, handleNativeUiEvent);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", save);
      window.removeEventListener(NATIVE_UI_EVENT, handleNativeUiEvent);
    };
  }, []);

  return null;
}

"use client";

/**
 * CONTRACT STUB — the notification center replaces the body; the signature is frozen.
 *
 * Drives the numberless red dot on the bell in both the feed and the
 * conversation-list headers. Unread state is per account (shared across
 * devices) and separate from conversation message read state.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { buildClientApiPath, clientApiNamespace, namespaceSupportsPostingFeed } from "@/lib/api-contract";

export type UnreadNotificationsState = {
  hasUnread: boolean;
  /** Re-read the unread state now (e.g. after returning to the screen). */
  refresh: () => void;
};

const NOOP = () => {};

// `/notifications/unread` exists only on the v2.2.0+ namespace. A pre-2.2.0
// client must never call it (it would 404), so the hook short-circuits to
// "no dot" for an unsupported namespace. Resolved at module load like
// `clientApiNamespace`.
const POSTING_FEED_SUPPORTED = namespaceSupportsPostingFeed(clientApiNamespace);

export function useUnreadNotifications(viewerId: string | null): UnreadNotificationsState {
  const normalizedViewerId = viewerId?.trim() || null;
  const [hasUnread, setHasUnread] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const fetchUnread = useCallback(async () => {
    if (!normalizedViewerId || !POSTING_FEED_SUPPORTED) {
      // Forced to false for a signed-out viewer or an unsupported client, so no
      // state write is needed here (and a synchronous write would trip
      // react-hooks/set-state-in-effect when called from the effect).
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch(buildClientApiPath("/notifications/unread"), {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) {
        // 401 (signed out) and transient failures both mean "show no dot".
        setHasUnread(false);
        return;
      }
      const payload = (await response.json()) as { hasUnread?: unknown };
      setHasUnread(payload.hasUnread === true);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setHasUnread(false);
    }
  }, [normalizedViewerId]);

  const refresh = useCallback(() => {
    void fetchUnread();
  }, [fetchUnread]);

  useEffect(() => {
    if (!normalizedViewerId || !POSTING_FEED_SUPPORTED) {
      abortRef.current?.abort();
      // Forced to false for a signed-out viewer or an unsupported client;
      // nothing to fetch and no listeners to attach.
      return;
    }

    // Defer the initial read a microtask so state updates never land
    // synchronously within the effect (react-hooks/set-state-in-effect).
    const schedule = typeof queueMicrotask === "function"
      ? queueMicrotask
      : (callback: () => void) => { void Promise.resolve().then(callback); };
    schedule(() => { void fetchUnread(); });

    const handleFocus = () => void fetchUnread();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void fetchUnread();
    };
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      abortRef.current?.abort();
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [fetchUnread, normalizedViewerId]);

  return normalizedViewerId && POSTING_FEED_SUPPORTED
    ? { hasUnread, refresh }
    : { hasUnread: false, refresh: NOOP };
}

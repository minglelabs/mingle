"use client";

/**
 * CONTRACT STUB — the notification center replaces the body; the signature is frozen.
 *
 * Drives the numberless red dot on the bell in both the feed and the
 * conversation-list headers. Unread state is per account (shared across
 * devices) and separate from conversation message read state.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { buildClientApiPath } from "@/lib/api-contract";

export type UnreadNotificationsState = {
  hasUnread: boolean;
  /** Re-read the unread state now (e.g. after returning to the screen). */
  refresh: () => void;
};

const NOOP = () => {};

export function useUnreadNotifications(viewerId: string | null): UnreadNotificationsState {
  const normalizedViewerId = viewerId?.trim() || null;
  const [hasUnread, setHasUnread] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const fetchUnread = useCallback(async () => {
    if (!normalizedViewerId) {
      // The returned state is forced to false for a signed-out viewer, so no
      // state write is needed (and a synchronous write here would trip
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
    if (!normalizedViewerId) {
      abortRef.current?.abort();
      // Returned state is forced to false for a signed-out viewer; nothing to fetch.
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

  return normalizedViewerId ? { hasUnread, refresh } : { hasUnread: false, refresh: NOOP };
}

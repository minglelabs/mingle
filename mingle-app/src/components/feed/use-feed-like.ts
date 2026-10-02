"use client";

import { buildClientApiPath } from "@/lib/api-contract";
import type { LikeMethod } from "@/lib/feed-analytics";
import { useCallback, useEffect, useRef, useState } from "react";
import { likeFailureFromResponse, optimisticLike, reconcileLike, type LikeError, type LikeState } from "./like-state";

export type { LikeError, LikeState } from "./like-state";

type UseFeedLikeOptions = {
  postId: string;
  initial: LikeState;
  /** Signed-out taps go to login instead of the API. */
  isSignedIn: boolean;
  onRequireLogin: () => void;
  /** Persist confirmed state up to the feed list so it survives re-render. */
  onChange?: (state: LikeState) => void;
  onError?: (error: LikeError) => void;
  /** A like / unlike the server confirmed, with the gesture that made it. */
  onCommitted?: (liked: boolean, method: LikeMethod) => void;
};

export type { LikeMethod };

type UseFeedLikeReturn = {
  state: LikeState;
  /** Toggle via the heart button (unlike if already liked). */
  toggleLike: () => void;
  /** Double-tap: like only, never unlikes, no duplicate count. */
  addLike: () => void;
  showBurst: boolean;
  clearBurst: () => void;
};

/**
 * Optimistic like state for one post, wired to
 * `POST` / `DELETE /posts/{id}/like`.
 *
 * - Optimistic flip, rolled back to the prior count/flag on failure.
 * - A 429 (`{ error: 'rate_limited', retryAfterSeconds }`) rolls back and
 *   surfaces the retry hint.
 * - A 403 `account_restricted` rolls back and reports `account_restricted`
 *   (the caller shows the moderation notice; nothing is retried).
 * - Concurrent taps are coalesced (`pendingRef`) so a double click cannot send
 *   two conflicting writes.
 * - Double-tap adds a like but never removes one, and shows the burst even when
 *   the post is already liked.
 */
export function useFeedLike(options: UseFeedLikeOptions): UseFeedLikeReturn {
  const { postId, initial, isSignedIn, onRequireLogin, onChange, onError, onCommitted } = options;

  const [state, setState] = useState<LikeState>(initial);
  const [showBurst, setShowBurst] = useState(false);
  const pendingRef = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Keep in sync if the underlying post is replaced (e.g. after refresh).
  useEffect(() => {
    setState(initial);
    // Only when the identity of the post's like data actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  const send = useCallback(
    async (nextLiked: boolean, method: LikeMethod) => {
      if (pendingRef.current) return;
      if (!isSignedIn) {
        onRequireLogin();
        return;
      }
      pendingRef.current = true;

      const prev = stateRef.current;
      const optimistic: LikeState = optimisticLike(prev, nextLiked);
      setState(optimistic);
      onChange?.(optimistic);

      const path = buildClientApiPath(`/posts/${encodeURIComponent(postId)}/like`);
      try {
        const res = await fetch(path, {
          method: nextLiked ? "POST" : "DELETE",
          cache: "no-store",
        });

        const failure = await likeFailureFromResponse(res);
        if (failure) {
          setState(prev);
          onChange?.(prev);
          onError?.(failure);
          return;
        }

        // Adopt the server's authoritative counts when returned.
        const body = (await res.json().catch(() => null)) as
          | { likeCount?: number; likedByMe?: boolean }
          | null;
        const confirmed = reconcileLike(optimistic, body);
        if (body && typeof body.likeCount === "number") {
          setState(confirmed);
          onChange?.(confirmed);
        }
        onCommitted?.(nextLiked, method);
      } catch {
        setState(prev);
        onChange?.(prev);
        onError?.({ kind: "generic" });
      } finally {
        pendingRef.current = false;
      }
    },
    [postId, isSignedIn, onRequireLogin, onChange, onError, onCommitted],
  );

  const toggleLike = useCallback(() => {
    if (!isSignedIn) {
      onRequireLogin();
      return;
    }
    void send(!stateRef.current.likedByMe, "button");
  }, [isSignedIn, onRequireLogin, send]);

  const addLike = useCallback(() => {
    if (!isSignedIn) {
      onRequireLogin();
      return;
    }
    setShowBurst(true);
    if (!stateRef.current.likedByMe) {
      void send(true, "double_tap");
    }
  }, [isSignedIn, onRequireLogin, send]);

  const clearBurst = useCallback(() => setShowBurst(false), []);

  return { state, toggleLike, addLike, showBurst, clearBurst };
}

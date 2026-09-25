"use client";

import { useCallback, useRef, useState } from "react";

export type LikeState = {
  likedByMe: boolean;
  likeCount: number;
};

type UseFeedLikeReturn = {
  state: LikeState;
  /** Toggle like via button (unlike if already liked). */
  toggleLike: () => void;
  /** Apply like via double-tap (no-op if already liked). */
  addLike: () => void;
  /** Whether the heart burst animation should play. */
  showBurst: boolean;
  clearBurst: () => void;
};

/**
 * Manages optimistic like state for a single post.
 * API integration is a stub — it always succeeds for now (mock mode).
 */
export function useFeedLike(
  postId: string,
  initial: LikeState,
): UseFeedLikeReturn {
  const [state, setState] = useState<LikeState>(initial);
  const [showBurst, setShowBurst] = useState(false);
  const pendingRef = useRef(false);

  const doLike = useCallback(async () => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    const prev = state;
    const next: LikeState = {
      likedByMe: true,
      likeCount: prev.likedByMe ? prev.likeCount : prev.likeCount + 1,
    };
    setState(next);
    setShowBurst(true);

    try {
      // TODO: POST /api/posts/{postId}/like
      void postId;
    } catch {
      setState(prev);
    } finally {
      pendingRef.current = false;
    }
  }, [postId, state]);

  const doUnlike = useCallback(async () => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    const prev = state;
    const next: LikeState = {
      likedByMe: false,
      likeCount: Math.max(0, prev.likeCount - 1),
    };
    setState(next);

    try {
      // TODO: DELETE /api/posts/{postId}/like
      void postId;
    } catch {
      setState(prev);
    } finally {
      pendingRef.current = false;
    }
  }, [postId, state]);

  const toggleLike = useCallback(() => {
    if (state.likedByMe) {
      void doUnlike();
    } else {
      void doLike();
    }
  }, [state.likedByMe, doLike, doUnlike]);

  const addLike = useCallback(() => {
    if (!state.likedByMe) {
      void doLike();
    } else {
      // Already liked — still show burst for feedback
      setShowBurst(true);
    }
  }, [state.likedByMe, doLike]);

  const clearBurst = useCallback(() => setShowBurst(false), []);

  return { state, toggleLike, addLike, showBurst, clearBurst };
}

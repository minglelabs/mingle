/**
 * Pure like-state transitions, extracted from `use-feed-like` so the optimistic
 * math and rollback are unit-tested without rendering the hook (this repo has
 * no React test renderer).
 */

export type LikeState = {
  likedByMe: boolean;
  likeCount: number;
};

/**
 * The state to show immediately when the viewer requests `nextLiked`.
 * Liking an already-liked post does not double-count; unliking never goes
 * below zero and only decrements a count the viewer had actually added.
 */
export function optimisticLike(prev: LikeState, nextLiked: boolean): LikeState {
  if (nextLiked) {
    return {
      likedByMe: true,
      likeCount: prev.likedByMe ? prev.likeCount : prev.likeCount + 1,
    };
  }
  return {
    likedByMe: false,
    likeCount: Math.max(0, prev.likedByMe ? prev.likeCount - 1 : prev.likeCount),
  };
}

/**
 * Adopt the server's authoritative counts when the response carries them,
 * otherwise keep the optimistic `nextLiked` flag. Counts never go negative.
 */
export function reconcileLike(
  optimistic: LikeState,
  server: { likeCount?: number; likedByMe?: boolean } | null,
): LikeState {
  if (!server || typeof server.likeCount !== "number") return optimistic;
  return {
    likedByMe: typeof server.likedByMe === "boolean" ? server.likedByMe : optimistic.likedByMe,
    likeCount: Math.max(0, server.likeCount),
  };
}

import { describe, expect, it } from "vitest";
import { optimisticLike, reconcileLike } from "./like-state";

describe("optimisticLike", () => {
  it("increments and sets liked when liking a not-liked post", () => {
    expect(optimisticLike({ likedByMe: false, likeCount: 4 }, true)).toEqual({
      likedByMe: true,
      likeCount: 5,
    });
  });

  it("does not double-count when liking an already-liked post", () => {
    expect(optimisticLike({ likedByMe: true, likeCount: 5 }, true)).toEqual({
      likedByMe: true,
      likeCount: 5,
    });
  });

  it("decrements and clears when unliking a liked post", () => {
    expect(optimisticLike({ likedByMe: true, likeCount: 5 }, false)).toEqual({
      likedByMe: false,
      likeCount: 4,
    });
  });

  it("never goes below zero and does not decrement a post the viewer had not liked", () => {
    expect(optimisticLike({ likedByMe: false, likeCount: 0 }, false)).toEqual({
      likedByMe: false,
      likeCount: 0,
    });
  });
});

describe("reconcileLike", () => {
  it("keeps the optimistic value when the server sends no counts", () => {
    const optimistic = { likedByMe: true, likeCount: 6 };
    expect(reconcileLike(optimistic, null)).toBe(optimistic);
    expect(reconcileLike(optimistic, {})).toBe(optimistic);
  });

  it("adopts server counts when present", () => {
    expect(reconcileLike({ likedByMe: true, likeCount: 6 }, { likeCount: 42, likedByMe: true })).toEqual({
      likedByMe: true,
      likeCount: 42,
    });
  });

  it("clamps negative server counts to zero", () => {
    expect(reconcileLike({ likedByMe: false, likeCount: 0 }, { likeCount: -3 })).toEqual({
      likedByMe: false,
      likeCount: 0,
    });
  });
});

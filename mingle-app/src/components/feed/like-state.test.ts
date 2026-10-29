import { describe, expect, it } from "vitest";
import { likeFailureFromResponse, optimisticLike, reconcileLike } from "./like-state";

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

describe("likeFailureFromResponse", () => {
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  it("returns null for a successful write", async () => {
    expect(await likeFailureFromResponse(json(200, { likeCount: 3, likedByMe: true }))).toBeNull();
  });

  it("classifies a restricted account (403 account_restricted) without a retry hint", async () => {
    expect(await likeFailureFromResponse(json(403, { error: "account_restricted" }))).toEqual({
      kind: "account_restricted",
    });
  });

  it("treats any other 403 as a generic failure", async () => {
    expect(await likeFailureFromResponse(json(403, { error: "forbidden" }))).toEqual({ kind: "generic" });
  });

  it("keeps the 429 retry-after hint", async () => {
    expect(await likeFailureFromResponse(json(429, { error: "rate_limited", retryAfterSeconds: 12 }))).toEqual({
      kind: "rate_limited",
      retryAfterSeconds: 12,
    });
  });

  it("does not consume the body the caller may still read", async () => {
    const res = json(200, { likeCount: 1 });
    await likeFailureFromResponse(res);
    expect(await res.json()).toEqual({ likeCount: 1 });
  });
});

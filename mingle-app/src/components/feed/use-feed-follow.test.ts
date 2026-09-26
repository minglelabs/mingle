import { describe, expect, it } from "vitest";
import { resolveFollowButtonState } from "./use-feed-follow";

describe("resolveFollowButtonState", () => {
  it("shows the button for a not-yet-followed author", () => {
    expect(resolveFollowButtonState("idle", { followingAuthor: false, isMine: false })).toBe("idle");
  });

  it("hides on other cards once the shared DTO flag flips (same author followed elsewhere)", () => {
    // This card never pressed follow; the shell patched followingAuthor=true.
    expect(resolveFollowButtonState("idle", { followingAuthor: true, isMine: false })).toBe("hidden");
  });

  it("keeps the success check on the card that followed, then hides", () => {
    expect(resolveFollowButtonState("success", { followingAuthor: true, isMine: false })).toBe("success");
    expect(resolveFollowButtonState("done", { followingAuthor: true, isMine: false })).toBe("hidden");
  });

  it("shows pending while the request is in flight", () => {
    expect(resolveFollowButtonState("pending", { followingAuthor: false, isMine: false })).toBe("pending");
  });

  it("hides for own posts and the self/signed-out null case", () => {
    expect(resolveFollowButtonState("idle", { followingAuthor: false, isMine: true })).toBe("hidden");
    expect(resolveFollowButtonState("idle", { followingAuthor: null, isMine: false })).toBe("hidden");
  });
});

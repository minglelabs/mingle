import { describe, expect, it } from "vitest";
import { feedSourceCacheKey } from "./feed-restore-state";

describe("feedSourceCacheKey", () => {
  it("gives each source kind a distinct, stable key", () => {
    expect(feedSourceCacheKey({ kind: "home" })).toBe("home");
    expect(feedSourceCacheKey({ kind: "author", authorId: "u1" })).toBe("author:u1");
    expect(feedSourceCacheKey({ kind: "search", query: "cats" })).toBe("search:cats");
  });
});

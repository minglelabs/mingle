import { describe, expect, it } from "vitest";
import { feedSourceCacheKey } from "./feed-restore-state";
import { loginHref } from "./login-redirect";

describe("feedSourceCacheKey", () => {
  it("gives each source kind a distinct, stable key", () => {
    expect(feedSourceCacheKey({ kind: "home" })).toBe("home");
    expect(feedSourceCacheKey({ kind: "author", authorId: "u1" })).toBe("author:u1");
    expect(feedSourceCacheKey({ kind: "search", query: "cats" })).toBe("search:cats");
  });
});

describe("loginHref", () => {
  it("returns to the same post after login", () => {
    const href = loginHref("ko", "post-9");
    expect(href.startsWith("/ko/auth/signin?")).toBe(true);
    const callback = new URLSearchParams(href.split("?")[1]).get("callbackUrl");
    expect(callback).toBe("/ko/feed?postId=post-9");
  });

  it("returns to the plain feed when no post is given", () => {
    const callback = new URLSearchParams(loginHref("en").split("?")[1]).get("callbackUrl");
    expect(callback).toBe("/en/feed");
  });
});

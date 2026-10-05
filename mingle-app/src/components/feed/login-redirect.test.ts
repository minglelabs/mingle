import { describe, expect, it } from "vitest";
import { composeLoginHref, loginHref } from "./login-redirect";

const callbackOf = (href: string) => new URLSearchParams(href.split("?")[1]).get("callbackUrl");

describe("composeLoginHref", () => {
  it("returns to compose after login", () => {
    const href = composeLoginHref("ko");
    expect(href.startsWith("/ko/auth/signin?")).toBe(true);
    expect(callbackOf(href)).toBe("/ko/compose");
  });

  it("post actions still return to the post", () => {
    expect(callbackOf(loginHref("en", "p1"))).toBe("/en/feed?postId=p1");
  });
});

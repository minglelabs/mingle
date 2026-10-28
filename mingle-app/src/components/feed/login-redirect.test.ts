import { describe, expect, it } from "vitest";
import { composeLoginReturnHref, loginReturnHref } from "./login-redirect";

describe("composeLoginReturnHref", () => {
  it("returns to compose after login", () => {
    expect(composeLoginReturnHref("ko")).toBe("/ko/compose");
  });
});

describe("loginReturnHref", () => {
  it("returns to the same post after login", () => {
    expect(loginReturnHref("ko", "post-9")).toBe("/ko/feed?postId=post-9");
  });

  it("returns to the plain feed when no post is given", () => {
    expect(loginReturnHref("en")).toBe("/en/feed");
    expect(loginReturnHref("en", null)).toBe("/en/feed");
  });

  it("never builds the web-only Google sign-in route", () => {
    for (const href of [loginReturnHref("ko", "p1"), loginReturnHref("en"), composeLoginReturnHref("ja")]) {
      expect(href).not.toContain("/auth/signin");
      expect(href.startsWith("/")).toBe(true);
    }
  });
});

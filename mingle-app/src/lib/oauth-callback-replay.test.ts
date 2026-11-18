import { describe, expect, it } from "vitest";
import { resolveNativeAuthReplayRedirect, type OAuthReplayInput } from "@/lib/oauth-callback-replay";

const SITE = "https://app.example.test";
const COMPLETE = `${SITE}/api/native-auth/complete?provider=google&callbackUrl=%2Fen%2Fconversations&requestId=rq_1`;

function input(overrides: Partial<OAuthReplayInput> = {}): OAuthReplayInput {
  return {
    responseStatus: 302,
    responseLocation: `${SITE}/api/auth/error?error=OAuthCallback`,
    cookieNames: ["__Host-next-auth.csrf-token", "__Secure-next-auth.callback-url", "__Secure-next-auth.session-token"],
    callbackUrlCookie: COMPLETE,
    siteUrl: SITE,
    ...overrides,
  };
}

describe("resolveNativeAuthReplayRedirect", () => {
  it("sends a signed-in replay back to the native complete route", () => {
    expect(resolveNativeAuthReplayRedirect(input())).toBe(COMPLETE);
  });

  it("accepts a relative callback cookie and a chunked session cookie", () => {
    expect(resolveNativeAuthReplayRedirect(input({
      callbackUrlCookie: "/api/native-auth/complete?provider=apple",
      cookieNames: ["__Secure-next-auth.session-token.0"],
    }))).toBe(`${SITE}/api/native-auth/complete?provider=apple`);
  });

  it("keeps the error when the browser has no session", () => {
    expect(resolveNativeAuthReplayRedirect(input({ cookieNames: ["__Secure-next-auth.callback-url"] }))).toBeNull();
  });

  it("keeps the error when the callback was not a native sign-in", () => {
    expect(resolveNativeAuthReplayRedirect(input({ callbackUrlCookie: `${SITE}/en/conversations` }))).toBeNull();
  });

  it("never redirects off the site", () => {
    expect(resolveNativeAuthReplayRedirect(input({
      callbackUrlCookie: "https://evil.example/api/native-auth/complete",
    }))).toBeNull();
    expect(resolveNativeAuthReplayRedirect(input({
      callbackUrlCookie: "//evil.example/api/native-auth/complete",
    }))).toBeNull();
  });

  it("leaves other outcomes alone", () => {
    expect(resolveNativeAuthReplayRedirect(input({ responseLocation: `${SITE}/en/conversations` }))).toBeNull();
    expect(resolveNativeAuthReplayRedirect(input({ responseLocation: `${SITE}/api/auth/error?error=AccessDenied` }))).toBeNull();
    expect(resolveNativeAuthReplayRedirect(input({ responseStatus: 200 }))).toBeNull();
    expect(resolveNativeAuthReplayRedirect(input({ callbackUrlCookie: null }))).toBeNull();
  });
});

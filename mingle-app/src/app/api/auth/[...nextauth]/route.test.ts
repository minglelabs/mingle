import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextAuthOptions } from "next-auth";

const { nextAuthMock, getAuthOptionsMock } = vi.hoisted(() => ({
  nextAuthMock: vi.fn(),
  getAuthOptionsMock: vi.fn(),
}));

vi.mock("next-auth/next", () => ({
  default: nextAuthMock,
}));

vi.mock("@/lib/auth-options", () => ({
  getAuthOptions: getAuthOptionsMock,
}));

import { GET, POST } from "@/app/api/auth/[...nextauth]/route";

type MinimalProvider = {
  id: string;
  type: string;
};

function buildRequest(url: string) {
  return {
    method: "POST",
    nextUrl: new URL(url),
  } as never;
}

function buildAuthOptions(): NextAuthOptions {
  const providers: MinimalProvider[] = [
    { id: "google", type: "oauth" },
    { id: "email-password", type: "credentials" },
    { id: "apple", type: "oauth" },
    { id: "native-bridge", type: "credentials" },
  ];
  return {
    providers: providers as never,
  };
}

describe("/api/auth/[...nextauth] route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nextAuthMock.mockResolvedValue(new Response(null, { status: 200 }));
    getAuthOptionsMock.mockReturnValue(buildAuthOptions());
  });

  it("keeps credentials provider when requested signin provider is email-password", async () => {
    await POST(
      buildRequest("http://localhost:3000/api/auth/signin/email-password"),
      { params: Promise.resolve({ nextauth: ["signin", "email-password"] }) },
    );

    expect(nextAuthMock).toHaveBeenCalledTimes(1);
    expect(getAuthOptionsMock).toHaveBeenCalledWith("email-password");
    const options = nextAuthMock.mock.calls[0]?.[2] as NextAuthOptions;
    const providerIds = (options.providers || []).map((provider) => provider.id);
    expect(providerIds).toEqual(["email-password"]);
  });

  it("keeps oauth-only provider list when requested signin provider is oauth", async () => {
    await POST(
      buildRequest("http://localhost:3000/api/auth/signin/google"),
      { params: Promise.resolve({ nextauth: ["signin", "google"] }) },
    );

    expect(nextAuthMock).toHaveBeenCalledTimes(1);
    expect(getAuthOptionsMock).toHaveBeenCalledWith("google");
    const options = nextAuthMock.mock.calls[0]?.[2] as NextAuthOptions;
    const providers = options.providers || [];
    const providerIds = providers.map((provider) => provider.id);
    expect(providerIds).toEqual(["google"]);
    expect(providers.every((provider) => provider.type !== "credentials")).toBe(true);
  });

  function buildErrorRequest(cookies: Record<string, string>, userAgent: string) {
    return {
      method: "GET",
      nextUrl: new URL("https://app.example/api/auth/signin?error=OAuthCallback"),
      cookies: { getAll: () => Object.entries(cookies).map(([name, value]) => ({ name, value })) },
      headers: new Headers({ "user-agent": userAgent }),
    } as never;
  }
  const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) Safari/604.1";

  it("sends a failed native sign-in back to the complete route instead of the sign-in page", async () => {
    const response = await GET(
      buildErrorRequest({
        "mingle-native-auth-return": encodeURIComponent(
          "/api/native-auth/complete?provider=google&callbackUrl=%2Fko&requestId=rq_1234567890ab",
        ),
      }, IPHONE_UA),
      { params: Promise.resolve({ nextauth: ["signin"] }) },
    );

    expect(nextAuthMock).not.toHaveBeenCalled();
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "/api/native-auth/complete?provider=google&callbackUrl=%2Fko&requestId=rq_1234567890ab&authError=OAuthCallback",
    );
  });

  it("uses the NextAuth callback cookie when it points at the native complete route", async () => {
    const response = await GET(
      buildErrorRequest({
        "__Secure-next-auth.callback-url":
          "https://app.example/api/native-auth/complete?provider=google&callbackUrl=%2Fko",
      }, IPHONE_UA),
      { params: Promise.resolve({ nextauth: ["error"] }) },
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("/api/native-auth/complete?");
    expect(response.headers.get("location")).toContain("authError=OAuthCallback");
  });

  it("hands a phone browser that lost every cookie back to the app", async () => {
    const response = await GET(
      buildErrorRequest({}, IPHONE_UA),
      { params: Promise.resolve({ nextauth: ["signin"] }) },
    );

    expect(nextAuthMock).not.toHaveBeenCalled();
    expect(await response.text()).toContain(
      "mingleauth://auth?status=error&provider=google&message=native_auth_oauth_failed",
    );
  });

  function buildPageRequest(url: string, cookies: Record<string, string>, userAgent: string) {
    return {
      method: "GET",
      nextUrl: new URL(url),
      cookies: { getAll: () => Object.entries(cookies).map(([name, value]) => ({ name, value })) },
      headers: new Headers({ "user-agent": userAgent }),
    } as never;
  }
  const MAC_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15";

  it("sends a website sign-in error to the app's own sign-in screen, back to where it started", async () => {
    const response = await GET(
      buildErrorRequest({
        "__Host-next-auth.csrf-token": "x",
        "__Secure-next-auth.callback-url": "https://app.example/ja/feed?postId=p1",
      }, IPHONE_UA),
      { params: Promise.resolve({ nextauth: ["signin"] }) },
    );

    expect(nextAuthMock).not.toHaveBeenCalled();
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "/ja/auth/login?callbackUrl=%2Fja%2Ffeed%3FpostId%3Dp1&authError=OAuthCallback",
    );
  });

  it("sends the error page to the sign-in screen too", async () => {
    const response = await GET(
      buildPageRequest("https://app.example/api/auth/error?error=AccessDenied", {}, MAC_UA),
      { params: Promise.resolve({ nextauth: ["error"] }) },
    );

    expect(response.headers.get("location")).toBe("/ko/auth/login?callbackUrl=%2F&authError=AccessDenied");
  });

  it("replaces the provider chooser with the sign-in screen", async () => {
    const response = await GET(
      buildPageRequest("https://app.example/api/auth/signin?callbackUrl=%2Fko%2Fcompose", {}, MAC_UA),
      { params: Promise.resolve({ nextauth: ["signin"] }) },
    );

    expect(nextAuthMock).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("/ko/auth/login?callbackUrl=%2Fko%2Fcompose");
  });

  it("never returns to another site", async () => {
    const response = await GET(
      buildPageRequest("https://app.example/api/auth/signin?callbackUrl=https%3A%2F%2Fevil.example%2F%2Fevil.example", {}, MAC_UA),
      { params: Promise.resolve({ nextauth: ["signin"] }) },
    );

    expect(response.headers.get("location")).toBe("/ko/auth/login?callbackUrl=%2F");
  });

  it("starts the OAuth flow right away for an older app's sheet", async () => {
    const response = await GET(
      buildPageRequest(
        "https://app.example/api/auth/signin/google?callbackUrl="
          + encodeURIComponent("/api/native-auth/complete?provider=google&callbackUrl=%2Fja%2Fconversations"),
        {},
        IPHONE_UA,
      ),
      { params: Promise.resolve({ nextauth: ["signin", "google"] }) },
    );

    expect(response.headers.get("location")).toBe(
      "/ja/auth/native?provider=google&callbackUrl="
        + encodeURIComponent("/api/native-auth/complete?provider=google&callbackUrl=%2Fja%2Fconversations"),
    );
  });

  it("keeps the nested callback's own parameters when returning to the app", async () => {
    const response = await GET(
      buildErrorRequest({
        "mingle-native-auth-return":
          "/api/native-auth/complete?provider=google&callbackUrl=%2Fko%2Fconversations%3FnativeStt%3D1%26nativeUi%3D1&requestId=rq_1234567890ab",
      }, IPHONE_UA),
      { params: Promise.resolve({ nextauth: ["error"] }) },
    );

    const location = new URL(response.headers.get("location") || "", "https://app.example");
    expect(location.searchParams.get("callbackUrl")).toBe("/ko/conversations?nativeStt=1&nativeUi=1");
    expect(location.searchParams.get("requestId")).toBe("rq_1234567890ab");
  });

  it("leaves the other NextAuth actions to NextAuth", async () => {
    await GET(
      buildPageRequest("https://app.example/api/auth/session", {}, MAC_UA),
      { params: Promise.resolve({ nextauth: ["session"] }) },
    );

    expect(nextAuthMock).toHaveBeenCalledTimes(1);
  });
});

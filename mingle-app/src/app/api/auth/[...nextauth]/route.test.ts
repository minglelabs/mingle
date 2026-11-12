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

import { GET } from "@/app/api/auth/[...nextauth]/route";

type MinimalProvider = {
  id: string;
  type: string;
};

function buildRequest(url: string) {
  return {
    method: "GET",
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
    await GET(
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
    await GET(
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

  it("keeps the sign-in page for a website sign-in error", async () => {
    await GET(
      buildErrorRequest({
        "__Host-next-auth.csrf-token": "x",
        "__Secure-next-auth.callback-url": "https://app.example/ko/feed",
      }, IPHONE_UA),
      { params: Promise.resolve({ nextauth: ["signin"] }) },
    );
    await GET(
      buildErrorRequest({}, "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15"),
      { params: Promise.resolve({ nextauth: ["signin"] }) },
    );

    expect(nextAuthMock).toHaveBeenCalledTimes(2);
  });
});

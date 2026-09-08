import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCreateWithDefaultHandle,
  mockCredentialsProvider,
  mockEnsureSignupWelcomeOnboarding,
  mockUserUpsert,
  mockVerifyNativeAuthBridgeToken,
} = vi.hoisted(() => ({
  mockCreateWithDefaultHandle: vi.fn(),
  mockCredentialsProvider: vi.fn(),
  mockEnsureSignupWelcomeOnboarding: vi.fn(),
  mockUserUpsert: vi.fn(),
  mockVerifyNativeAuthBridgeToken: vi.fn(),
}));

vi.mock("@next-auth/prisma-adapter", () => ({
  PrismaAdapter: vi.fn(() => ({})),
}));

vi.mock("next-auth/providers/apple", () => ({
  default: vi.fn(() => ({ id: "apple", type: "oauth" })),
}));

vi.mock("next-auth/providers/credentials", () => ({
  default: mockCredentialsProvider,
}));

vi.mock("next-auth/providers/google", () => ({
  default: vi.fn(() => ({ id: "google", type: "oauth" })),
}));

vi.mock("@/lib/apple-oauth", () => ({
  resolveAppleOAuthCredentials: vi.fn(() => null),
}));

vi.mock("@/lib/email-password-auth", () => ({
  verifyPassword: vi.fn(),
}));

vi.mock("@/lib/handles", () => ({
  createWithDefaultHandle: mockCreateWithDefaultHandle,
}));

vi.mock("@/lib/signup-welcome-onboarding", () => ({
  ensureSignupWelcomeOnboarding: mockEnsureSignupWelcomeOnboarding,
}));

vi.mock("@/lib/native-auth-bridge", () => ({
  verifyNativeAuthBridgeToken: mockVerifyNativeAuthBridgeToken,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      upsert: mockUserUpsert,
    },
  },
}));

import { getAuthOptions } from "@/lib/auth-options";

const transientCookieKeys = ["callbackUrl", "pkceCodeVerifier", "state", "nonce"] as const;

describe("getAuthOptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateWithDefaultHandle.mockImplementation(
      async (_input: unknown, create: (handle: string) => Promise<unknown>) => create("new-handle"),
    );
    mockCredentialsProvider.mockImplementation((config) => ({
      ...config,
      type: "credentials",
    }));
    mockUserUpsert.mockResolvedValue({});
  });

  it("uses Lax cookies for Google and None cookies for Apple's form_post callback", () => {
    const googleCookies = getAuthOptions("google").cookies;
    const appleCookies = getAuthOptions(" Apple ").cookies;

    for (const key of transientCookieKeys) {
      expect(googleCookies?.[key]?.options.sameSite).toBe("lax");
      expect(appleCookies?.[key]?.options.sameSite).toBe("none");
    }
  });

  it("runs Royce onboarding when NextAuth creates a new OAuth user", async () => {
    const options = getAuthOptions("google");

    await options.events?.createUser?.({
      user: {
        id: "oauth_new_user",
        name: "New OAuth User",
        email: "oauth@example.com",
        image: null,
      },
    });

    expect(mockEnsureSignupWelcomeOnboarding).toHaveBeenCalledWith({
      userId: "oauth_new_user",
      locale: "en",
    });
  });

  it("does not overwrite a provider identity during the native session bridge", async () => {
    mockVerifyNativeAuthBridgeToken.mockReturnValue({
      sub: "native_apple_user",
      email: "relay@example.com",
      name: "Apple User",
      provider: "apple",
    });
    mockUserUpsert.mockResolvedValue({
      id: "native_apple_user",
      name: "Apple User",
      email: "relay@example.com",
      externalUserId: "apple:stable_provider_subject",
    });
    const options = getAuthOptions();
    const nativeBridgeProvider = options.providers.find((provider) => provider.id === "native-bridge");
    const authorize = (nativeBridgeProvider as {
      authorize?: (credentials: { token: string }) => Promise<unknown>;
    } | undefined)?.authorize;

    await authorize?.({ token: "valid-bridge-token" });

    expect(mockUserUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "native_apple_user" },
      update: expect.not.objectContaining({
        externalUserId: expect.anything(),
      }),
    }));
  });

  it("does not replace an OAuth provider identity during the sign-in event", async () => {
    const options = getAuthOptions("apple");

    await options.events?.signIn?.({
      user: {
        id: "native_apple_user",
        name: "Apple User",
        email: "relay@example.com",
      },
      account: null,
      isNewUser: false,
    } as never);

    expect(mockUserUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "native_apple_user" },
      update: expect.not.objectContaining({
        externalUserId: expect.anything(),
      }),
    }));
  });
});

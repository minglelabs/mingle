import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCreateWithDefaultHandle,
  mockEnsureSignupWelcomeOnboarding,
  mockUserUpsert,
} = vi.hoisted(() => ({
  mockCreateWithDefaultHandle: vi.fn(),
  mockEnsureSignupWelcomeOnboarding: vi.fn(),
  mockUserUpsert: vi.fn(),
}));

vi.mock("@next-auth/prisma-adapter", () => ({
  PrismaAdapter: vi.fn(() => ({})),
}));

vi.mock("next-auth/providers/apple", () => ({
  default: vi.fn(() => ({ id: "apple", type: "oauth" })),
}));

vi.mock("next-auth/providers/credentials", () => ({
  default: vi.fn(() => ({ id: "credentials", type: "credentials" })),
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
  verifyNativeAuthBridgeToken: vi.fn(),
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
});

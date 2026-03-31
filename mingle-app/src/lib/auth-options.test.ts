import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const appleProviderMock = vi.fn((config: unknown) => ({
  id: "apple",
  type: "oauth",
  config,
}));
const googleProviderMock = vi.fn((config: unknown) => ({
  id: "google",
  type: "oauth",
  config,
}));
const credentialsProviderMock = vi.fn((config: { id: string }) => ({
  id: config.id,
  type: "credentials",
  config,
}));

vi.mock("next-auth/providers/apple", () => ({
  default: appleProviderMock,
}));

vi.mock("next-auth/providers/google", () => ({
  default: googleProviderMock,
}));

vi.mock("next-auth/providers/credentials", () => ({
  default: credentialsProviderMock,
}));

vi.mock("@next-auth/prisma-adapter", () => ({
  PrismaAdapter: vi.fn(() => ({})),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/apple-sign-in", () => ({
  isNativeAppleAuthConfiguredFromEnv: vi.fn(() => true),
}));

vi.mock("@/lib/email-password-auth", () => ({
  verifyPassword: vi.fn(() => true),
}));

vi.mock("@/lib/native-auth-bridge", () => ({
  verifyNativeAuthBridgeToken: vi.fn(() => null),
}));

const APPLE_ENV_NAMES = [
  "AUTH_APPLE_WEB_ENABLED",
  "AUTH_APPLE_ID",
  "AUTH_APPLE_SECRET",
  "AUTH_APPLE_TEAM_ID",
  "AUTH_APPLE_KEY_ID",
  "AUTH_APPLE_PRIVATE_KEY",
] as const;

const ORIGINAL_ENV = Object.fromEntries(
  APPLE_ENV_NAMES.map((name) => [name, process.env[name]]),
) as Record<(typeof APPLE_ENV_NAMES)[number], string | undefined>;

function restoreAppleEnv() {
  for (const name of APPLE_ENV_NAMES) {
    const originalValue = ORIGINAL_ENV[name];
    if (typeof originalValue === "string") {
      process.env[name] = originalValue;
      continue;
    }
    delete process.env[name];
  }
}

describe("auth-options Apple web OAuth gating", () => {
  beforeEach(() => {
    restoreAppleEnv();
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    restoreAppleEnv();
  });

  it("skips Apple provider and warning logs when web Apple OAuth is disabled", async () => {
    process.env.AUTH_APPLE_ID = "com.mingle.web";
    process.env.AUTH_APPLE_TEAM_ID = "TEAM123456";
    process.env.AUTH_APPLE_KEY_ID = "KEY1234567";
    process.env.AUTH_APPLE_PRIVATE_KEY = "invalid_private_key";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { getAuthOptions, isAppleWebOAuthConfigured } = await import("@/lib/auth-options");
    const providerIds = (getAuthOptions().providers || []).map((provider) => provider.id);

    expect(isAppleWebOAuthConfigured()).toBe(false);
    expect(providerIds).not.toContain("apple");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("attempts to configure Apple provider only when web Apple OAuth is explicitly enabled", async () => {
    process.env.AUTH_APPLE_WEB_ENABLED = "true";
    process.env.AUTH_APPLE_ID = "com.mingle.web";
    process.env.AUTH_APPLE_SECRET = "static_secret_value";

    const { getAuthOptions, isAppleWebOAuthConfigured } = await import("@/lib/auth-options");
    const providerIds = (getAuthOptions().providers || []).map((provider) => provider.id);

    expect(isAppleWebOAuthConfigured()).toBe(true);
    expect(providerIds).toContain("apple");
    expect(appleProviderMock).toHaveBeenCalledTimes(1);
  });
});

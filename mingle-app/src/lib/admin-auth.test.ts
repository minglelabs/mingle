import { afterEach, describe, expect, it } from "vitest";
import {
  ADMIN_SESSION_COOKIE_NAME,
  ADMIN_SESSION_MAX_AGE_SECONDS,
  createAdminSessionToken,
  isAdminAuthConfigured,
  verifyAdminLogin,
  verifyAdminSessionToken,
} from "@/lib/admin-auth";

const ORIGINAL_ENV = {
  AUTH_SECRET: process.env.AUTH_SECRET,
  MINGLE_ADMIN_USERNAME: process.env.MINGLE_ADMIN_USERNAME,
  MINGLE_ADMIN_PASSWORD: process.env.MINGLE_ADMIN_PASSWORD,
};

function restoreEnvValue(name: keyof typeof ORIGINAL_ENV) {
  const value = ORIGINAL_ENV[name];
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

describe("admin-auth", () => {
  afterEach(() => {
    restoreEnvValue("AUTH_SECRET");
    restoreEnvValue("MINGLE_ADMIN_USERNAME");
    restoreEnvValue("MINGLE_ADMIN_PASSWORD");
  });

  it("reports admin auth as disabled when credentials are missing", () => {
    delete process.env.MINGLE_ADMIN_USERNAME;
    delete process.env.MINGLE_ADMIN_PASSWORD;

    expect(isAdminAuthConfigured()).toBe(false);
    expect(createAdminSessionToken()).toBeNull();
    expect(verifyAdminLogin("admin", "password")).toBe(false);
    expect(verifyAdminSessionToken("v1.anything")).toBe(false);
  });

  it("verifies login credentials and session tokens from environment variables", () => {
    process.env.AUTH_SECRET = "server-secret";
    process.env.MINGLE_ADMIN_USERNAME = "admin";
    process.env.MINGLE_ADMIN_PASSWORD = "strong-password";

    const token = createAdminSessionToken();

    expect(ADMIN_SESSION_COOKIE_NAME).toBe("mingle_admin_session");
    expect(ADMIN_SESSION_MAX_AGE_SECONDS).toBeGreaterThan(60 * 60 * 24 * 365);
    expect(verifyAdminLogin(" admin ", "strong-password")).toBe(true);
    expect(verifyAdminLogin("admin", "wrong-password")).toBe(false);
    expect(token).toMatch(/^v1\./);
    expect(verifyAdminSessionToken(token)).toBe(true);
    expect(verifyAdminSessionToken(`${token}x`)).toBe(false);
  });

  it("invalidates existing tokens when the configured password changes", () => {
    process.env.AUTH_SECRET = "server-secret";
    process.env.MINGLE_ADMIN_USERNAME = "admin";
    process.env.MINGLE_ADMIN_PASSWORD = "first-password";

    const token = createAdminSessionToken();

    process.env.MINGLE_ADMIN_PASSWORD = "second-password";

    expect(verifyAdminSessionToken(token)).toBe(false);
  });
});

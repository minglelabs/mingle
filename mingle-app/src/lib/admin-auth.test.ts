import { afterEach, describe, expect, it, vi } from "vitest";
import * as adminAuth from "@/lib/admin-auth";
import {
  ADMIN_LOGIN_FAILURE_WINDOW_MS,
  ADMIN_LOGIN_MAX_FAILURES,
  ADMIN_SESSION_COOKIE_NAME,
  createAdminLoginThrottle,
  isAdminAuthConfigured,
  verifyAdminLogin,
} from "@/lib/admin-auth";

describe("admin-auth credentials", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reports admin auth as disabled when credentials are missing", () => {
    vi.stubEnv("MINGLE_ADMIN_USERNAME", "");
    vi.stubEnv("MINGLE_ADMIN_PASSWORD", "");

    expect(isAdminAuthConfigured()).toBe(false);
    expect(verifyAdminLogin("admin", "password")).toBe(false);
  });

  it("verifies login credentials from environment variables", () => {
    vi.stubEnv("MINGLE_ADMIN_USERNAME", "admin");
    vi.stubEnv("MINGLE_ADMIN_PASSWORD", "strong-password");

    expect(ADMIN_SESSION_COOKIE_NAME).toBe("mingle_admin_session");
    expect(isAdminAuthConfigured()).toBe(true);
    expect(verifyAdminLogin(" admin ", "strong-password")).toBe(true);
    expect(verifyAdminLogin("admin", "wrong-password")).toBe(false);
    expect(verifyAdminLogin("someone", "strong-password")).toBe(false);
    expect(verifyAdminLogin(undefined, "strong-password")).toBe(false);
    expect(verifyAdminLogin("admin", null)).toBe(false);
  });

  it("no longer derives a session token from the credential (old cookies stop working)", () => {
    expect(Object.keys(adminAuth)).not.toContain("createAdminSessionToken");
    expect(Object.keys(adminAuth)).not.toContain("verifyAdminSessionToken");
    expect(Object.keys(adminAuth)).not.toContain("ADMIN_SESSION_MAX_AGE_SECONDS");
  });
});

describe("admin login throttle", () => {
  const T0 = 1_800_000_000_000;

  it("throttles an ip after 5 failures inside 15 minutes", () => {
    const throttle = createAdminLoginThrottle();
    expect(ADMIN_LOGIN_MAX_FAILURES).toBe(5);
    expect(ADMIN_LOGIN_FAILURE_WINDOW_MS).toBe(15 * 60 * 1000);

    for (let attempt = 1; attempt < 5; attempt += 1) {
      expect(throttle.recordFailure("203.0.113.7", T0 + attempt * 1000)).toBe(false);
      expect(throttle.isThrottled("203.0.113.7", T0 + attempt * 1000)).toBe(false);
    }
    expect(throttle.recordFailure("203.0.113.7", T0 + 5000)).toBe(true);
    expect(throttle.isThrottled("203.0.113.7", T0 + 5000)).toBe(true);
  });

  it("keeps each ip separate", () => {
    const throttle = createAdminLoginThrottle();
    for (let attempt = 0; attempt < 5; attempt += 1) throttle.recordFailure("203.0.113.7", T0);
    expect(throttle.isThrottled("203.0.113.7", T0)).toBe(true);
    expect(throttle.isThrottled("198.51.100.4", T0)).toBe(false);
  });

  it("lifts the lock 15 minutes after the oldest counted failure (sliding window)", () => {
    const throttle = createAdminLoginThrottle();
    for (let attempt = 0; attempt < 5; attempt += 1) throttle.recordFailure("ip", T0 + attempt * 60_000);

    expect(throttle.isThrottled("ip", T0 + ADMIN_LOGIN_FAILURE_WINDOW_MS - 1)).toBe(true);
    expect(throttle.isThrottled("ip", T0 + ADMIN_LOGIN_FAILURE_WINDOW_MS)).toBe(false);
    // One more failure inside the window of the other four locks it again.
    expect(throttle.recordFailure("ip", T0 + ADMIN_LOGIN_FAILURE_WINDOW_MS + 1)).toBe(true);
  });

  it("forgets an ip's failures after a successful login", () => {
    const throttle = createAdminLoginThrottle();
    for (let attempt = 0; attempt < 4; attempt += 1) throttle.recordFailure("ip", T0);
    throttle.clear("ip");
    for (let attempt = 0; attempt < 4; attempt += 1) expect(throttle.recordFailure("ip", T0)).toBe(false);
    expect(throttle.isThrottled("ip", T0)).toBe(false);
  });
});

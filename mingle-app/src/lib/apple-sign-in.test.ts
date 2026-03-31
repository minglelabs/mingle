import { describe, expect, it } from "vitest";
import { isNativeAppleAuthConfiguredFromEnv } from "@/lib/apple-sign-in";

describe("isNativeAppleAuthConfiguredFromEnv", () => {
  it("returns true when a native Apple audience and auth secret are configured", () => {
    expect(isNativeAppleAuthConfiguredFromEnv({
      AUTH_APPLE_BUNDLE_ID: "com.minglelabs.mingle.rn",
      NEXTAUTH_SECRET: "secret-value",
    })).toBe(true);
  });

  it("accepts AUTH_APPLE_ID as an allowed native audience fallback", () => {
    expect(isNativeAppleAuthConfiguredFromEnv({
      AUTH_APPLE_ID: "com.mingle.web",
      AUTH_SECRET: "secret-value",
    })).toBe(true);
  });

  it("returns false when the auth bridge secret is missing", () => {
    expect(isNativeAppleAuthConfiguredFromEnv({
      AUTH_APPLE_NATIVE_AUDIENCES: "com.minglelabs.mingle.rn",
    })).toBe(false);
  });

  it("returns false when no Apple audience is configured", () => {
    expect(isNativeAppleAuthConfiguredFromEnv({
      NEXTAUTH_SECRET: "secret-value",
    })).toBe(false);
  });
});

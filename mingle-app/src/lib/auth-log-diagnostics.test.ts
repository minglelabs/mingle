import { encode } from "next-auth/jwt";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  decodeSessionTokenWithDiagnostics,
  readSessionClaimsUnverified,
  summarizeAuthLogMeta,
} from "@/lib/auth-log-diagnostics";

const SECRET = "test-nextauth-secret";
const DAY = 86_400;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("summarizeAuthLogMeta", () => {
  it("prints claim and reason when the metadata is a jose claim error itself", () => {
    const error = Object.assign(new Error('"exp" claim timestamp check failed'), {
      code: "ERR_JWT_EXPIRED",
      claim: "exp",
      reason: "check_failed",
    });
    error.name = "JWTExpired";

    expect(summarizeAuthLogMeta(error)).toBe(
      'keys=code,claim,reason,name name=JWTExpired errCode=ERR_JWT_EXPIRED claim=exp reason=check_failed'
      + ' error=""exp" claim timestamp check failed"',
    );
  });

  it("keeps the old shape for { error } metadata", () => {
    expect(summarizeAuthLogMeta({ error: "State cookie was missing.", providerId: "google" }))
      .toBe('keys=error,providerId error="State cookie was missing."');
  });
});

describe("session token diagnostics", () => {
  it("reads iat/exp/sub from a real NextAuth token without checking them", async () => {
    const token = await encode({ token: { sub: "user_1" }, secret: SECRET, maxAge: 30 * DAY });
    const claims = readSessionClaimsUnverified(token, SECRET);
    expect(claims?.sub).toBe("user_1");
    expect((claims?.exp ?? 0) - (claims?.iat ?? 0)).toBe(30 * DAY);
  });

  it("returns null for the wrong secret", async () => {
    const token = await encode({ token: { sub: "user_1" }, secret: SECRET, maxAge: DAY });
    expect(readSessionClaimsUnverified(token, "other-secret")).toBeNull();
  });

  it("logs claim, issue time and expiry when an expired token is rejected", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    // Issued 40 days ago with NextAuth's old 30-day default, so it expired 10 days ago.
    vi.useFakeTimers({ now: Date.now() - 40 * DAY * 1000, toFake: ["Date"] });
    const token = await encode({ token: { sub: "user_1" }, secret: SECRET, maxAge: 30 * DAY });
    vi.useRealTimers();

    await expect(decodeSessionTokenWithDiagnostics({ token, secret: SECRET })).rejects.toMatchObject({
      claim: "exp",
    });

    const line = String(errorLog.mock.calls[0]?.[0]);
    expect(line).toContain("[nextauth:jwt-decode-failed]");
    expect(line).toContain("claim=exp");
    expect(line).toContain("reason=check_failed");
    expect(line).toContain("sub=user_1");
    expect(line).toMatch(/ageDays=40\.0/);
    expect(line).toMatch(/expiredDaysAgo=10\.0/);
  });

  it("logs claims=unreadable when the secret does not match", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const token = await encode({ token: { sub: "user_1" }, secret: SECRET, maxAge: DAY });

    await expect(decodeSessionTokenWithDiagnostics({ token, secret: "other-secret" })).rejects.toThrow();
    expect(String(errorLog.mock.calls[0]?.[0])).toContain("claims=unreadable");
  });

  it("does not log for a valid token", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const token = await encode({ token: { sub: "user_1" }, secret: SECRET, maxAge: DAY });

    await expect(decodeSessionTokenWithDiagnostics({ token, secret: SECRET })).resolves.toMatchObject({ sub: "user_1" });
    expect(errorLog).not.toHaveBeenCalled();
  });
});

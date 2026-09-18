import { describe, expect, it, vi } from "vitest";
import { mintRealtimeToken, readRealtimeSecret, signRealtimeToken, verifyRealtimeToken } from "@/lib/realtime-token";

describe("realtime-token", () => {
  it("verifies a token it just signed", () => {
    const token = mintRealtimeToken({ sessionKey: "sess_abc", userId: "user-1", secret: "shh" });
    const payload = verifyRealtimeToken(token, "shh");
    expect(payload?.sessionKey).toBe("sess_abc");
    expect(payload?.userId).toBe("user-1");
  });

  it("rejects a token signed with a different secret", () => {
    const token = mintRealtimeToken({ sessionKey: "sess_abc", userId: "user-1", secret: "shh" });
    expect(verifyRealtimeToken(token, "other")).toBeNull();
  });

  it("rejects a tampered payload even with a valid-looking signature", () => {
    const token = signRealtimeToken({ sessionKey: "sess_abc", userId: "user-1", exp: Date.now() + 60_000 }, "shh");
    const [, signature] = token.split(".");
    const tamperedBody = Buffer.from(JSON.stringify({ sessionKey: "sess_other", userId: "user-1", exp: Date.now() + 60_000 }), "utf8").toString("base64url");
    expect(verifyRealtimeToken(`${tamperedBody}.${signature}`, "shh")).toBeNull();
  });

  it("rejects an expired token", () => {
    const token = signRealtimeToken({ sessionKey: "sess_abc", userId: "user-1", exp: Date.now() - 1_000 }, "shh");
    expect(verifyRealtimeToken(token, "shh")).toBeNull();
  });

  it("rejects malformed tokens", () => {
    expect(verifyRealtimeToken("", "shh")).toBeNull();
    expect(verifyRealtimeToken("no-dot-here", "shh")).toBeNull();
    expect(verifyRealtimeToken(".missing-body", "shh")).toBeNull();
  });

  it("reads the shared secret from the environment, blank when unset", () => {
    vi.stubEnv("MINGLE_REALTIME_SECRET", "  configured-secret  ");
    expect(readRealtimeSecret()).toBe("configured-secret");
    vi.stubEnv("MINGLE_REALTIME_SECRET", "");
    expect(readRealtimeSecret()).toBe("");
    vi.unstubAllEnvs();
  });
});

import { describe, expect, it } from "vitest";
import { mintRealtimeToken, signRealtimeToken, verifyRealtimeToken } from "./realtime-token";

const SECRET = "test-secret";

describe("signRealtimeToken / verifyRealtimeToken", () => {
  it("round-trips a payload signed with the same secret", () => {
    const payload = { conversationId: "conv-1", userId: "u1", exp: Date.now() + 60_000 };
    expect(verifyRealtimeToken(signRealtimeToken(payload, SECRET), SECRET)).toEqual(payload);
  });

  it("rejects a token signed with a different secret", () => {
    const token = signRealtimeToken({ conversationId: "conv-1", userId: "u1", exp: Date.now() + 60_000 }, SECRET);
    expect(verifyRealtimeToken(token, "wrong-secret")).toBeNull();
  });

  it("rejects an expired token", () => {
    const token = signRealtimeToken({ conversationId: "conv-1", userId: "u1", exp: Date.now() - 1 }, SECRET);
    expect(verifyRealtimeToken(token, SECRET)).toBeNull();
  });

  it("rejects malformed input without throwing", () => {
    expect(verifyRealtimeToken("", SECRET)).toBeNull();
    expect(verifyRealtimeToken("not-a-token", SECRET)).toBeNull();
    expect(verifyRealtimeToken("abc.def", SECRET)).toBeNull();
  });
});

describe("mintRealtimeToken", () => {
  it("produces a token that verifies to the given conversation and user", () => {
    const token = mintRealtimeToken({ conversationId: "conv-1", userId: "u1", secret: SECRET });
    const payload = verifyRealtimeToken(token, SECRET);

    expect(payload?.conversationId).toBe("conv-1");
    expect(payload?.userId).toBe("u1");
    expect(payload?.exp).toBeGreaterThan(Date.now());
  });
});

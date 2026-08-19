import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyRealtimeToken } from "@/lib/realtime-token";
import { mintConversationRealtimeToken, notifyConversationMessage } from "./conversation-realtime";

describe("mintConversationRealtimeToken", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns null when no secret is configured, rather than minting an unverifiable token", () => {
    vi.stubEnv("MINGLE_REALTIME_SECRET", "");

    expect(mintConversationRealtimeToken({ conversationId: "conv-1", userId: "u1" })).toBeNull();
  });

  it("mints a token mingle-stt's own verifier accepts", () => {
    vi.stubEnv("MINGLE_REALTIME_SECRET", "shared-secret");

    const token = mintConversationRealtimeToken({ conversationId: "conv-1", userId: "u1" });
    const payload = token ? verifyRealtimeToken(token, "shared-secret") : null;

    expect(payload?.conversationId).toBe("conv-1");
    expect(payload?.userId).toBe("u1");
  });
});

describe("notifyConversationMessage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("does nothing when the secret or the STT URL is unconfigured", async () => {
    vi.stubEnv("MINGLE_REALTIME_SECRET", "");
    vi.stubEnv("NEXT_PUBLIC_WS_URL", "wss://stt.example.com/stt");
    notifyConversationMessage({ conversationId: "conv-1", messageId: "msg-1" });
    expect(fetch).not.toHaveBeenCalled();

    vi.stubEnv("MINGLE_REALTIME_SECRET", "shared-secret");
    vi.stubEnv("NEXT_PUBLIC_WS_URL", "");
    notifyConversationMessage({ conversationId: "conv-1", messageId: "msg-1" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("derives the HTTP publish URL from the WS URL's origin, swapping scheme and dropping the path", async () => {
    vi.stubEnv("MINGLE_REALTIME_SECRET", "shared-secret");
    vi.stubEnv("NEXT_PUBLIC_WS_URL", "wss://mingle-stt.example.com/stt");

    notifyConversationMessage({ conversationId: "conv-1", messageId: "msg-1" });
    await Promise.resolve();

    expect(fetch).toHaveBeenCalledWith(
      "https://mingle-stt.example.com/conversation-events/publish",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ authorization: "Bearer shared-secret" }),
        body: JSON.stringify({ conversationId: "conv-1", messageId: "msg-1" }),
      }),
    );
  });

  it("handles a plain ws:// URL the same way", async () => {
    vi.stubEnv("MINGLE_REALTIME_SECRET", "shared-secret");
    vi.stubEnv("NEXT_PUBLIC_WS_URL", "ws://localhost:5202");

    notifyConversationMessage({ conversationId: "conv-1", messageId: "msg-1" });
    await Promise.resolve();

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:5202/conversation-events/publish",
      expect.anything(),
    );
  });

  it("never throws when the publish call itself rejects", async () => {
    vi.stubEnv("MINGLE_REALTIME_SECRET", "shared-secret");
    vi.stubEnv("NEXT_PUBLIC_WS_URL", "wss://mingle-stt.example.com/stt");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    expect(() => notifyConversationMessage({ conversationId: "conv-1", messageId: "msg-1" })).not.toThrow();
  });
});

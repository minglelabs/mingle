import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildConversationListEventKey,
  mintConversationListRealtimeToken,
  mintConversationRealtimeToken,
  notifyConversationMessage,
  reserveConversationVoiceOrder,
} from "@/server/conversation-realtime";
import { verifyRealtimeToken } from "@/lib/realtime-token";
import { mintVoiceOrderReceipt } from '@/lib/voice-order-receipt';

describe("conversation-realtime", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    global.fetch = originalFetch;
  });

  describe("mintConversationRealtimeToken", () => {
    it("returns null when realtime push is unconfigured (no shared secret)", () => {
      vi.stubEnv("MINGLE_REALTIME_SECRET", "");
      expect(mintConversationRealtimeToken({ sessionKey: "sess_a", userId: "user-1" })).toBeNull();
    });

    it("mints a token mingle-messaging's verify function would accept", () => {
      vi.stubEnv("MINGLE_REALTIME_SECRET", "shared-secret");
      const token = mintConversationRealtimeToken({ sessionKey: "sess_a", userId: "user-1" });
      expect(token).not.toBeNull();
      const payload = verifyRealtimeToken(token as string, "shared-secret");
      expect(payload?.sessionKey).toBe("sess_a");
      expect(payload?.userId).toBe("user-1");
    });
  });

  describe("notifyConversationMessage", () => {
    it('bounds reaction notifications when messaging stops responding', async () => {
      vi.stubEnv('MINGLE_REALTIME_SECRET', 'shared-secret');
      vi.stubEnv('MINGLE_MESSAGING_URL', 'http://127.0.0.1:3002');
      let signal: AbortSignal | undefined;
      global.fetch = vi.fn((_url, init) => new Promise<Response>((_resolve, reject) => {
        signal = init?.signal ?? undefined;
        signal?.addEventListener('abort', () => reject(new Error('publish_timeout')));
      }));
      await expect(notifyConversationMessage('room', [], undefined, { timeoutMs: 5 })).resolves.toBeUndefined();
      expect(signal?.aborted).toBe(true);
    });
    it('reserves through the same messaging service and rejects invalid responses without inventing a second clock', async () => {
      vi.stubEnv('MINGLE_REALTIME_SECRET', 'shared-secret');
      vi.stubEnv('MINGLE_MESSAGING_URL', 'http://127.0.0.1:3002');
      const scope = { sessionKey: 'room', userId: 'alice', clientMessageId: 'voice' };
      const receipt = mintVoiceOrderReceipt(scope);
      const fetcher = vi.fn().mockResolvedValue(Response.json({ orderReceipt: receipt }));
      global.fetch = fetcher;
      expect(await reserveConversationVoiceOrder(scope)).toBe(receipt);
      expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ ...scope, reserveOrder: true });
      fetcher.mockResolvedValue(Response.json({ orderReceipt: 'forged' }));
      expect(await reserveConversationVoiceOrder(scope)).toBeNull();
      fetcher.mockResolvedValue(new Response(null, { status: 204 }));
      expect(await reserveConversationVoiceOrder(scope)).toBeNull();
      fetcher.mockRejectedValue(new Error('offline'));
      expect(await reserveConversationVoiceOrder(scope)).toBeNull();
    });
    it("does nothing when unconfigured", () => {
      vi.stubEnv("MINGLE_REALTIME_SECRET", "");
      vi.stubEnv("NEXT_PUBLIC_WS_URL", "wss://host/stt");
      const fetchSpy = vi.fn();
      global.fetch = fetchSpy as unknown as typeof fetch;

      notifyConversationMessage("sess_a");

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("posts to the messaging publish endpoint derived from the ws origin", () => {
      vi.stubEnv("MINGLE_REALTIME_SECRET", "shared-secret");
      vi.stubEnv("NEXT_PUBLIC_WS_URL", "wss://mingle-1-1-4-production.up.railway.app/stt");
      const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
      global.fetch = fetchSpy as unknown as typeof fetch;

      notifyConversationMessage("sess_a");

      expect(fetchSpy).toHaveBeenCalledWith(
        "https://mingle-1-1-4-production.up.railway.app/conversation-events/publish",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ authorization: "Bearer shared-secret" }),
          body: JSON.stringify({ sessionKey: "sess_a", keys: [] }),
        }),
      );
    });

    it("posts to the explicitly configured messaging service", () => {
      vi.stubEnv("MINGLE_REALTIME_SECRET", "shared-secret");
      vi.stubEnv("MINGLE_MESSAGING_URL", "http://127.0.0.1:3002/");
      const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
      global.fetch = fetchSpy as unknown as typeof fetch;

      notifyConversationMessage("sess_a");

      expect(fetchSpy).toHaveBeenCalledWith(
        "http://127.0.0.1:3002/conversation-events/publish",
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("also fans out a list:<userId> key per member, so their list screen updates without a refresh", () => {
      vi.stubEnv("MINGLE_REALTIME_SECRET", "shared-secret");
      vi.stubEnv("NEXT_PUBLIC_WS_URL", "wss://mingle-1-1-4-production.up.railway.app/stt");
      const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
      global.fetch = fetchSpy as unknown as typeof fetch;

      notifyConversationMessage("sess_a", ["user-1", "user-2", "user-1"]);

      expect(fetchSpy).toHaveBeenCalledWith(
        "https://mingle-1-1-4-production.up.railway.app/conversation-events/publish",
        expect.objectContaining({
          body: JSON.stringify({ sessionKey: "sess_a", keys: ["list:user-1", "list:user-2"] }),
        }),
      );
    });

    it("never throws when the fetch itself rejects", async () => {
      vi.stubEnv("MINGLE_REALTIME_SECRET", "shared-secret");
      vi.stubEnv("NEXT_PUBLIC_WS_URL", "wss://host/stt");
      global.fetch = vi.fn().mockRejectedValue(new Error("network down")) as unknown as typeof fetch;

      expect(() => notifyConversationMessage("sess_a")).not.toThrow();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    it("does nothing for a blank sessionKey and no members", () => {
      vi.stubEnv("MINGLE_REALTIME_SECRET", "shared-secret");
      vi.stubEnv("NEXT_PUBLIC_WS_URL", "wss://host/stt");
      const fetchSpy = vi.fn();
      global.fetch = fetchSpy as unknown as typeof fetch;

      notifyConversationMessage("   ");

      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe("buildConversationListEventKey", () => {
    it("scopes a user id to the list-events topic", () => {
      expect(buildConversationListEventKey("user-1")).toBe("list:user-1");
    });
  });

  describe("mintConversationListRealtimeToken", () => {
    it("returns null when realtime push is unconfigured (no shared secret)", () => {
      vi.stubEnv("MINGLE_REALTIME_SECRET", "");
      expect(mintConversationListRealtimeToken("user-1")).toBeNull();
    });

    it("mints a token scoped to this user's list topic", () => {
      vi.stubEnv("MINGLE_REALTIME_SECRET", "shared-secret");
      const token = mintConversationListRealtimeToken("user-1");
      expect(token).not.toBeNull();
      const payload = verifyRealtimeToken(token as string, "shared-secret");
      expect(payload?.sessionKey).toBe("list:user-1");
      expect(payload?.userId).toBe("user-1");
    });
  });
});

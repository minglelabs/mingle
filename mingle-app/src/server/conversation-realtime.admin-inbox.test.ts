import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildAdminInboxEventKey,
  buildConversationListEventKey,
  isReservedRealtimeEventKey,
  mintAdminInboxRealtimeToken,
  publishAdminInboxEvent,
  resolveConversationEventsWsUrl,
} from "@/server/conversation-realtime";
import { verifyRealtimeToken } from "@/lib/realtime-token";

function stubRealtimeEnv(env: Partial<Record<
  "MINGLE_REALTIME_SECRET" | "MINGLE_MESSAGING_URL" | "NEXT_PUBLIC_MESSAGING_WS_URL" | "NEXT_PUBLIC_WS_URL",
  string
>>) {
  vi.stubEnv("MINGLE_REALTIME_SECRET", env.MINGLE_REALTIME_SECRET ?? "");
  vi.stubEnv("MINGLE_MESSAGING_URL", env.MINGLE_MESSAGING_URL ?? "");
  vi.stubEnv("NEXT_PUBLIC_MESSAGING_WS_URL", env.NEXT_PUBLIC_MESSAGING_WS_URL ?? "");
  vi.stubEnv("NEXT_PUBLIC_WS_URL", env.NEXT_PUBLIC_WS_URL ?? "");
}

describe("admin inbox realtime topic", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    global.fetch = originalFetch;
  });

  describe("buildAdminInboxEventKey", () => {
    it("is admin: + the first 32 hex chars of HMAC-SHA256(secret, 'admin-inbox:v1')", () => {
      stubRealtimeEnv({ MINGLE_REALTIME_SECRET: "shared-secret" });
      const expected = createHmac("sha256", "shared-secret").update("admin-inbox:v1").digest("hex").slice(0, 32);
      expect(buildAdminInboxEventKey()).toBe(`admin:${expected}`);
      expect(buildAdminInboxEventKey()).toMatch(/^admin:[0-9a-f]{32}$/);
    });

    it("is stable for one secret and changes with the secret", () => {
      stubRealtimeEnv({ MINGLE_REALTIME_SECRET: "secret-a" });
      const first = buildAdminInboxEventKey();
      expect(buildAdminInboxEventKey()).toBe(first);
      stubRealtimeEnv({ MINGLE_REALTIME_SECRET: "secret-b" });
      expect(buildAdminInboxEventKey()).not.toBe(first);
    });

    it("is null when realtime is unconfigured", () => {
      stubRealtimeEnv({});
      expect(buildAdminInboxEventKey()).toBeNull();
      expect(mintAdminInboxRealtimeToken()).toBeNull();
    });

    it("can never be a user-choosable room key or a list key", () => {
      stubRealtimeEnv({ MINGLE_REALTIME_SECRET: "shared-secret" });
      const key = buildAdminInboxEventKey() as string;
      expect(isReservedRealtimeEventKey(key)).toBe(true);
      expect(key).not.toBe(buildConversationListEventKey("admin"));
      expect(key.startsWith("conv_")).toBe(false);
    });
  });

  describe("isReservedRealtimeEventKey", () => {
    it.each(["list:user_1", "admin:abc", "  admin:abc", "LIST:user_1", "Admin:x"])("reserves %s", (key) => {
      expect(isReservedRealtimeEventKey(key)).toBe(true);
    });

    it.each(["sess_legacy_room", "conv_0123abcd", "listing", "administrator", "my-list:x", ""])("allows %s", (key) => {
      expect(isReservedRealtimeEventKey(key)).toBe(false);
    });
  });

  describe("mintAdminInboxRealtimeToken", () => {
    it("mints a one-hour token for the admin topic that mingle-messaging accepts", () => {
      stubRealtimeEnv({ MINGLE_REALTIME_SECRET: "shared-secret" });
      const before = Date.now();
      const token = mintAdminInboxRealtimeToken();
      const payload = verifyRealtimeToken(token as string, "shared-secret");
      expect(payload?.sessionKey).toBe(buildAdminInboxEventKey());
      expect(payload?.userId).toBe("admin");
      expect(payload?.liveReader).toBeUndefined();
      expect(payload?.liveWriter).toBeUndefined();
      expect(payload!.exp - before).toBeGreaterThanOrEqual(60 * 60 * 1000 - 1000);
      expect(payload!.exp - before).toBeLessThanOrEqual(60 * 60 * 1000 + 1000);
    });
  });

  describe("publishAdminInboxEvent", () => {
    it("publishes only the admin key, with no room key and no content", async () => {
      stubRealtimeEnv({ MINGLE_REALTIME_SECRET: "shared-secret", MINGLE_MESSAGING_URL: "http://127.0.0.1:3002" });
      const fetchSpy = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
      global.fetch = fetchSpy as unknown as typeof fetch;

      await publishAdminInboxEvent();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toBe("http://127.0.0.1:3002/conversation-events/publish");
      expect(init.headers).toEqual(expect.objectContaining({ authorization: "Bearer shared-secret" }));
      expect(JSON.parse(init.body)).toEqual({ keys: [buildAdminInboxEventKey()] });
      expect(init.signal).toBeInstanceOf(AbortSignal);
    });

    it("does nothing when unconfigured", async () => {
      stubRealtimeEnv({ MINGLE_MESSAGING_URL: "http://127.0.0.1:3002" });
      const fetchSpy = vi.fn();
      global.fetch = fetchSpy as unknown as typeof fetch;
      await publishAdminInboxEvent();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("never throws on a failed, rejected or hung publish", async () => {
      stubRealtimeEnv({ MINGLE_REALTIME_SECRET: "shared-secret", MINGLE_MESSAGING_URL: "http://127.0.0.1:3002" });
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      global.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 500 })) as unknown as typeof fetch;
      await expect(publishAdminInboxEvent()).resolves.toBeUndefined();
      global.fetch = vi.fn().mockRejectedValue(new Error("offline")) as unknown as typeof fetch;
      await expect(publishAdminInboxEvent()).resolves.toBeUndefined();
      let signal: AbortSignal | undefined;
      global.fetch = vi.fn((_url: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
        signal = init?.signal ?? undefined;
        signal?.addEventListener("abort", () => reject(new Error("publish_timeout")));
      })) as unknown as typeof fetch;
      await expect(publishAdminInboxEvent({ timeoutMs: 5 })).resolves.toBeUndefined();
      expect(signal?.aborted).toBe(true);
      warn.mockRestore();
    });
  });

  describe("resolveConversationEventsWsUrl", () => {
    const request = (url: string, headers: Record<string, string> = {}) => ({ url, headers: new Headers(headers) });

    it("uses the configured messaging URL, defaulting its path like the client", () => {
      stubRealtimeEnv({ NEXT_PUBLIC_MESSAGING_WS_URL: "wss://messaging.example.com" });
      expect(resolveConversationEventsWsUrl(request("https://app.example.com/admin/inbox/api/realtime-token")))
        .toBe("wss://messaging.example.com/conversation-events");
      stubRealtimeEnv({ NEXT_PUBLIC_MESSAGING_WS_URL: "ws://127.0.0.1:3002/custom-events" });
      expect(resolveConversationEventsWsUrl(request("http://localhost:3000/x")))
        .toBe("ws://127.0.0.1:3002/custom-events");
      stubRealtimeEnv({ NEXT_PUBLIC_MESSAGING_WS_URL: "not a url" });
      expect(resolveConversationEventsWsUrl(request("http://localhost:3000/x"))).toBeNull();
    });

    it("falls back to the origin of the configured speech socket, like the client", () => {
      stubRealtimeEnv({ NEXT_PUBLIC_WS_URL: "wss://mingle-1-1-4-production.up.railway.app/stt" });
      expect(resolveConversationEventsWsUrl(request("http://10.0.0.5:3000/admin/inbox/api/realtime-token")))
        .toBe("wss://mingle-1-1-4-production.up.railway.app/conversation-events");
    });

    it("otherwise uses the page's own public origin behind the proxy", () => {
      stubRealtimeEnv({});
      expect(resolveConversationEventsWsUrl(request("http://127.0.0.1:3000/admin/inbox/api/realtime-token", {
        host: "127.0.0.1:3000",
        "x-forwarded-host": "mingle.example.com",
        "x-forwarded-proto": "https",
      }))).toBe("wss://mingle.example.com/conversation-events");
      expect(resolveConversationEventsWsUrl(request("http://localhost:3000/admin/inbox/api/realtime-token", {
        host: "localhost:3000",
      }))).toBe("ws://localhost:3000/conversation-events");
    });

    it("ignores a malformed forwarded host", () => {
      stubRealtimeEnv({});
      expect(resolveConversationEventsWsUrl(request("https://mingle.example.com/admin/inbox/api/realtime-token", {
        "x-forwarded-host": "evil.example.com/path?x=1",
        "x-forwarded-proto": "https",
      }))).toBe("wss://mingle.example.com/conversation-events");
    });
  });
});

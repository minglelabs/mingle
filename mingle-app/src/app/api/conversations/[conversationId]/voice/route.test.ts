import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockGetServerSession, mockSessionKeyForMember, mockResolveUser, mockFindUser } = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockSessionKeyForMember: vi.fn(),
  mockResolveUser: vi.fn(),
  mockFindUser: vi.fn(),
}));

// after() needs a live request scope; the start push and list refresh it
// schedules are not what these tests check.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: vi.fn(),
}));
vi.mock("next-auth", () => ({ getServerSession: mockGetServerSession }));
vi.mock("@/lib/auth-options", () => ({ getAuthOptions: () => ({}) }));
vi.mock("@/lib/app-conversations", () => ({ getConversationSessionKeyForMember: mockSessionKeyForMember }));
vi.mock("@/lib/request-user-identity", () => ({ resolveOrCreateUserIdForRequest: mockResolveUser }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: mockFindUser } } }));
vi.mock("@/server/voice/prisma-voice-store", () => ({ prismaVoiceStore: {} }));

import { GET } from "@/app/api/conversations/[conversationId]/voice/route";
import { POST as TOKEN } from "@/app/api/conversations/[conversationId]/voice/token/route";
import { POST as LEAVE } from "@/app/api/conversations/[conversationId]/voice/leave/route";
import { resetVoiceReadReconcileForTests, setVoiceCallAnnouncerForTests, setVoiceStoreForTests } from "@/server/api/controllers/shared/voice-call-controller";
import { after } from "next/server";
import { createMemoryVoiceStore } from "@/server/voice/memory-voice-store";
import { verifyHs256 } from "@/server/voice/livekit-auth";

const params = { params: Promise.resolve({ conversationId: "chan-1" }) };

function asUser(userId: string) {
  mockResolveUser.mockResolvedValue({ userId, identity: { id: userId }, tracking: null });
}

function tokenRequest(body: unknown) {
  return new NextRequest("http://localhost/api/conversations/chan-1/voice/token", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("/api/conversations/[conversationId]/voice routes", () => {
  let store: ReturnType<typeof createMemoryVoiceStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    store = createMemoryVoiceStore();
    // LiveKit cannot be asked in tests: null means "unknown", so nobody is dropped.
    setVoiceStoreForTests(store, async () => null);
    process.env.LIVEKIT_URL = "wss://voice.example.test";
    process.env.LIVEKIT_API_KEY = "APItestkey";
    process.env.LIVEKIT_API_SECRET = "test-secret-value-0123456789";
    mockGetServerSession.mockResolvedValue(null);
    mockSessionKeyForMember.mockImplementation(async ({ userId }: { userId: string }) =>
      userId.startsWith("user-") ? "session-a" : null);
    mockFindUser.mockResolvedValue({ name: "Mia" });
    asUser("user-1");
  });

  it("gives a member a join token and the live call", async () => {
    const response = await TOKEN(tokenRequest({ lang: "ko", interpret: true }), params);
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body).toMatchObject({ url: "wss://voice.example.test", identity: "user-1" });
    expect(body.room).toMatch(/^voice-chan-1-/);
    expect(body.call.participants).toHaveLength(1);
    expect(verifyHs256(body.token, "test-secret-value-0123456789")).toMatchObject({
      sub: "user-1",
      name: "Mia",
      attributes: { lang: "ko", interpret: "off", role: "speaker" },
      video: { room: body.room, roomJoin: true },
    });

    const status = await (await GET(new NextRequest("http://localhost/x"), params)).json();
    expect(status.call.id).toBe(body.call.id);
  });

  it("leaves one 'started a voice talk' message in the room when a call starts, none when someone joins it", async () => {
    const announce = vi.fn().mockResolvedValue(undefined);
    setVoiceCallAnnouncerForTests(announce);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    // Runs what the route scheduled for after the response (the list refresh
    // and the push fail quietly here; only the announcement is checked).
    const runScheduled = async () => {
      const scheduled = vi.mocked(after).mock.calls.map(([task]) => task as () => Promise<void>);
      vi.mocked(after).mockClear();
      for (const task of scheduled) await task().catch(() => undefined);
    };

    const started = await (await TOKEN(tokenRequest({ lang: "ko" }), params)).json();
    await runScheduled();
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith({ sessionKey: "session-a", callId: started.call.id, starterUserId: "user-1" });

    asUser("user-2");
    const joinedBody = await (await TOKEN(tokenRequest({ lang: "en" }), params)).json();
    await runScheduled();
    // The same call: one call per room, and no second announcement.
    expect(joinedBody.call.id).toBe(started.call.id);
    expect(announce).toHaveBeenCalledTimes(1);
  });

  it("frees the seat of an app that was closed without leaving when the call is read, asking LiveKit at most once per interval", async () => {
    resetVoiceReadReconcileForTests();
    const lookup = vi.fn<(config: unknown, room: string) => Promise<string[] | null>>().mockResolvedValue([]);
    setVoiceStoreForTests(store, lookup as never);
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-11-11T10:00:00Z"));
      await TOKEN(tokenRequest({ lang: "ko" }), params);
      lookup.mockClear();

      // Just joined: LiveKit may not list them yet, so the seat is kept.
      vi.setSystemTime(new Date("2026-11-11T10:00:10Z"));
      expect((await (await GET(new NextRequest("http://localhost/api/conversations/chan-1/voice"), params)).json()).call.participants).toHaveLength(1);
      expect(lookup).toHaveBeenCalledTimes(1);

      // Read again right away: LiveKit is not asked a second time.
      vi.setSystemTime(new Date("2026-11-11T10:00:12Z"));
      await GET(new NextRequest("http://localhost/api/conversations/chan-1/voice"), params);
      expect(lookup).toHaveBeenCalledTimes(1);

      // Past the grace, LiveKit still does not have them: the seat is freed and the call ends.
      vi.setSystemTime(new Date("2026-11-11T10:01:00Z"));
      expect((await (await GET(new NextRequest("http://localhost/api/conversations/chan-1/voice"), params)).json()).call).toBeNull();
      expect(lookup).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns 403 to someone who is not in the chat room", async () => {
    asUser("stranger");
    expect((await TOKEN(tokenRequest({ lang: "ko" }), params)).status).toBe(403);
    expect((await GET(new NextRequest("http://localhost/x"), params)).status).toBe(403);
  });

  it("returns 409 voice_room_full to the 9th person", async () => {
    for (let index = 1; index <= 8; index += 1) {
      asUser(`user-${index}`);
      expect((await TOKEN(tokenRequest({ lang: "ko" }), params)).status).toBe(200);
    }
    asUser("user-9");
    const full = await TOKEN(tokenRequest({ lang: "ko" }), params);
    expect(full.status).toBe(409);
    expect(await full.json()).toEqual({ error: "voice_room_full" });
  });

  it("ends the call when the last person leaves", async () => {
    await TOKEN(tokenRequest({ lang: "ko" }), params);
    const response = await LEAVE(new NextRequest("http://localhost/x", { method: "POST" }), params);
    expect(await response.json()).toEqual({ ok: true, ended: true });
    expect((await (await GET(new NextRequest("http://localhost/x"), params)).json()).call).toBeNull();
  });

  it("rejects a bad language code", async () => {
    expect((await TOKEN(tokenRequest({ lang: "<script>" }), params)).status).toBe(400);
  });
});

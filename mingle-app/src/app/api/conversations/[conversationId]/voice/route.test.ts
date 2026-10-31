import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockGetServerSession, mockSessionKeyForMember, mockResolveUser, mockFindUser } = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockSessionKeyForMember: vi.fn(),
  mockResolveUser: vi.fn(),
  mockFindUser: vi.fn(),
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
import { setVoiceStoreForTests } from "@/server/api/controllers/shared/voice-call-controller";
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
    setVoiceStoreForTests(store);
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
      attributes: { lang: "ko", interpret: "on", role: "speaker" },
      video: { room: body.room, roomJoin: true },
    });

    const status = await (await GET(new NextRequest("http://localhost/x"), params)).json();
    expect(status.call.id).toBe(body.call.id);
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

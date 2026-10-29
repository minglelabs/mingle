import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  createConversationChannelForUser: vi.fn(),
  resolveOrCreateUserIdForRequest: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/auth-options", () => ({ getAuthOptions: () => ({}) }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findMany: vi.fn().mockResolvedValue([]) } } }));
vi.mock("@/lib/posthog-server", () => ({ captureMingleEvent: vi.fn() }));
vi.mock("@/lib/app-analytics", () => ({ ensureTrackingContext: vi.fn() }));
vi.mock("@/lib/app-conversations", () => ({
  createConversationChannelForUser: m.createConversationChannelForUser,
  findExistingConversationWithExactMembers: vi.fn().mockResolvedValue(null),
  findOrCreateDirectConversation: vi.fn(),
  listConversationChannelsForExternalUserId: vi.fn(),
  listConversationChannelsForUser: vi.fn(),
  MAX_CONVERSATION_MEMBERS: 10,
}));
vi.mock("@/lib/request-user-identity", () => ({
  normalizeSessionUserIdentity: vi.fn(),
  requestAllowsLegacyAnonymousUser: vi.fn(),
  resolveOrCreateUserIdForRequest: m.resolveOrCreateUserIdForRequest,
  resolveTrackingExternalUserId: vi.fn(),
  resolveTrackingSessionKey: vi.fn(),
  sanitizeRequestIdentityValue: (value: string) => (value || "").trim().slice(0, 128),
}));

import { postConversationResponse } from "./conversations-controller";

function createRoom(legacySessionKey: unknown) {
  return postConversationResponse(new NextRequest("https://example.com/api/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ legacySessionKey }),
  }));
}

describe("postConversationResponse: client-supplied legacy session key", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.resolveOrCreateUserIdForRequest.mockResolvedValue({
      userId: "user_1",
      identity: { id: "user_1", email: "", externalUserId: "", sessionKey: "" },
      tracking: null,
    });
    m.createConversationChannelForUser.mockResolvedValue({ id: "conv_1", sessionKey: "conv_generated" });
  });

  it("seeds the new room with an ordinary legacy key", async () => {
    const response = await createRoom("sess_legacy_room");
    expect(response.status).toBe(201);
    expect(m.createConversationChannelForUser.mock.calls[0][1].preferredSessionKey).toBe("sess_legacy_room");
  });

  it.each([
    "list:victim_user",
    "admin:0123456789abcdef0123456789abcdef",
    "  admin:x",
    "LIST:victim_user",
    "Admin:x",
  ])("ignores the reserved realtime key %s and lets the server generate one", async (key) => {
    const response = await createRoom(key);
    expect(response.status).toBe(201);
    expect(m.createConversationChannelForUser).toHaveBeenCalledTimes(1);
    expect(m.createConversationChannelForUser.mock.calls[0][1].preferredSessionKey).toBeUndefined();
  });
});

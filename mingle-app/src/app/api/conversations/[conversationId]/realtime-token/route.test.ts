import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  mockGetServerSession,
  mockGetConversationSessionKeyForMember,
  mockMintConversationRealtimeToken,
  mockResolveOrCreateUserIdForRequest,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockGetConversationSessionKeyForMember: vi.fn(),
  mockMintConversationRealtimeToken: vi.fn(),
  mockResolveOrCreateUserIdForRequest: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: mockGetServerSession,
}));

vi.mock("@/lib/auth-options", () => ({
  getAuthOptions: () => ({}),
}));

vi.mock("@/lib/app-conversations", () => ({
  getConversationSessionKeyForMember: mockGetConversationSessionKeyForMember,
}));

vi.mock("@/server/conversation-realtime", () => ({
  mintConversationRealtimeToken: mockMintConversationRealtimeToken,
}));

vi.mock("@/lib/request-user-identity", () => ({
  resolveOrCreateUserIdForRequest: mockResolveOrCreateUserIdForRequest,
}));

import { GET } from "@/app/api/conversations/[conversationId]/realtime-token/route";

describe("/api/conversations/[conversationId]/realtime-token route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSession.mockResolvedValue(null);
    mockResolveOrCreateUserIdForRequest.mockResolvedValue({
      userId: "user-1",
      identity: { id: "user-1", email: "", externalUserId: "", sessionKey: "" },
      tracking: null,
    });
  });

  it("mints a token for a real member", async () => {
    mockGetConversationSessionKeyForMember.mockResolvedValue("session-a");
    mockMintConversationRealtimeToken.mockReturnValue("signed.token");

    const response = await GET(
      new NextRequest("https://example.com/api/conversations/conv-a/realtime-token"),
      { params: Promise.resolve({ conversationId: "conv-a" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ token: "signed.token" });
    expect(mockMintConversationRealtimeToken).toHaveBeenCalledWith({
      sessionKey: "session-a",
      userId: "user-1",
    });
  });

  it("returns token: null when realtime push is unconfigured, not an error", async () => {
    mockGetConversationSessionKeyForMember.mockResolvedValue("session-a");
    mockMintConversationRealtimeToken.mockReturnValue(null);

    const response = await GET(
      new NextRequest("https://example.com/api/conversations/conv-a/realtime-token"),
      { params: Promise.resolve({ conversationId: "conv-a" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ token: null });
  });

  it("returns not_found for a channel the caller isn't a member of", async () => {
    mockGetConversationSessionKeyForMember.mockResolvedValue(null);

    const response = await GET(
      new NextRequest("https://example.com/api/conversations/conv-a/realtime-token"),
      { params: Promise.resolve({ conversationId: "conv-a" }) },
    );

    expect(response.status).toBe(404);
    expect(mockMintConversationRealtimeToken).not.toHaveBeenCalled();
  });

  it("returns unauthorized when the request identity cannot resolve to a user", async () => {
    mockResolveOrCreateUserIdForRequest.mockResolvedValue({
      userId: "",
      identity: { id: "", email: "", externalUserId: "", sessionKey: "" },
      tracking: null,
    });

    const response = await GET(
      new NextRequest("https://example.com/api/conversations/conv-a/realtime-token"),
      { params: Promise.resolve({ conversationId: "conv-a" }) },
    );

    expect(response.status).toBe(401);
    expect(mockGetConversationSessionKeyForMember).not.toHaveBeenCalled();
  });
});

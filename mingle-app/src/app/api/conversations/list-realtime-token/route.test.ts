import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  mockGetServerSession,
  mockMintConversationListRealtimeToken,
  mockResolveOrCreateUserIdForRequest,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockMintConversationListRealtimeToken: vi.fn(),
  mockResolveOrCreateUserIdForRequest: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: mockGetServerSession,
}));

vi.mock("@/lib/auth-options", () => ({
  getAuthOptions: () => ({}),
}));

vi.mock("@/server/conversation-realtime", () => ({
  mintConversationListRealtimeToken: mockMintConversationListRealtimeToken,
}));

vi.mock("@/lib/request-user-identity", () => ({
  resolveOrCreateUserIdForRequest: mockResolveOrCreateUserIdForRequest,
}));

import { GET } from "@/app/api/conversations/list-realtime-token/route";

describe("/api/conversations/list-realtime-token route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSession.mockResolvedValue(null);
    mockResolveOrCreateUserIdForRequest.mockResolvedValue({
      userId: "user-1",
      identity: { id: "user-1", email: "", externalUserId: "", sessionKey: "" },
      tracking: null,
    });
  });

  it("mints a token scoped to the caller's own list topic", async () => {
    mockMintConversationListRealtimeToken.mockReturnValue("signed.list.token");

    const response = await GET(new NextRequest("https://example.com/api/conversations/list-realtime-token"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ token: "signed.list.token" });
    expect(mockMintConversationListRealtimeToken).toHaveBeenCalledWith("user-1");
  });

  it("returns token: null when realtime push is unconfigured, not an error", async () => {
    mockMintConversationListRealtimeToken.mockReturnValue(null);

    const response = await GET(new NextRequest("https://example.com/api/conversations/list-realtime-token"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ token: null });
  });

  it("returns unauthorized when the request identity cannot resolve to a user", async () => {
    mockResolveOrCreateUserIdForRequest.mockResolvedValue({
      userId: "",
      identity: { id: "", email: "", externalUserId: "", sessionKey: "" },
      tracking: null,
    });

    const response = await GET(new NextRequest("https://example.com/api/conversations/list-realtime-token"));
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json).toEqual({ error: "unauthorized" });
    expect(mockMintConversationListRealtimeToken).not.toHaveBeenCalled();
  });
});

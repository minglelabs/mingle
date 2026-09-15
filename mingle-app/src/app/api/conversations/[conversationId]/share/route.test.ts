import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  mockGetServerSession,
  mockGetConversationChannelSharing,
  mockSetConversationChannelSharing,
  mockResolveOrCreateUserIdForRequest,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockGetConversationChannelSharing: vi.fn(),
  mockSetConversationChannelSharing: vi.fn(),
  mockResolveOrCreateUserIdForRequest: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: mockGetServerSession,
}));

vi.mock("@/lib/auth-options", () => ({
  getAuthOptions: () => ({}),
}));

vi.mock("@/lib/app-conversations", () => ({
  getConversationChannelSharing: mockGetConversationChannelSharing,
  setConversationChannelSharing: mockSetConversationChannelSharing,
}));

vi.mock("@/lib/request-user-identity", () => ({
  resolveOrCreateUserIdForRequest: mockResolveOrCreateUserIdForRequest,
}));

vi.mock("@/lib/app-analytics", () => ({
  ensureTrackingContext: vi.fn(),
}));

import { GET, POST } from "@/app/api/conversations/[conversationId]/share/route";

function postShareRequest(body: unknown) {
  return new NextRequest("https://example.com/api/conversations/conv-a/share", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("/api/conversations/[conversationId]/share route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSession.mockResolvedValue(null);
    mockResolveOrCreateUserIdForRequest.mockResolvedValue({
      userId: "user-owner",
      identity: { id: "user-owner", email: "", externalUserId: "", sessionKey: "" },
      tracking: null,
    });
  });

  it("returns sharing status for any member, not just the owner", async () => {
    mockGetConversationChannelSharing.mockResolvedValue({ shareEnabled: true, shareToken: "tok-a" });

    const response = await GET(
      new NextRequest("https://example.com/api/conversations/conv-a/share"),
      { params: Promise.resolve({ conversationId: "conv-a" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ shareEnabled: true, shareToken: "tok-a" });
    expect(mockGetConversationChannelSharing).toHaveBeenCalledWith({
      conversationId: "conv-a",
      userId: "user-owner",
    });
  });

  it("returns not_found for a room the caller isn't a member of", async () => {
    mockGetConversationChannelSharing.mockResolvedValue(null);

    const response = await GET(
      new NextRequest("https://example.com/api/conversations/conv-a/share"),
      { params: Promise.resolve({ conversationId: "conv-a" }) },
    );

    expect(response.status).toBe(404);
  });

  it("enables sharing and returns the share token", async () => {
    mockSetConversationChannelSharing.mockResolvedValue({
      id: "conv-a",
      shareEnabled: true,
      shareToken: "tok-a",
    });

    const response = await POST(
      postShareRequest({ enabled: true }),
      { params: Promise.resolve({ conversationId: "conv-a" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.shareEnabled).toBe(true);
    expect(json.shareToken).toBe("tok-a");
    expect(mockSetConversationChannelSharing).toHaveBeenCalledWith({
      conversationId: "conv-a",
      userId: "user-owner",
      enabled: true,
    });
  });

  it("disables sharing and reflects shareEnabled: false", async () => {
    mockSetConversationChannelSharing.mockResolvedValue({
      id: "conv-a",
      shareEnabled: false,
      shareToken: "tok-a",
    });

    const response = await POST(
      postShareRequest({ enabled: false }),
      { params: Promise.resolve({ conversationId: "conv-a" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.shareEnabled).toBe(false);
  });

  it("returns not_found when the caller isn't the room's owner", async () => {
    mockSetConversationChannelSharing.mockResolvedValue(null);

    const response = await POST(
      postShareRequest({ enabled: true }),
      { params: Promise.resolve({ conversationId: "conv-a" }) },
    );

    expect(response.status).toBe(404);
  });

  it("rejects a body without a boolean enabled field", async () => {
    const response = await POST(
      postShareRequest({}),
      { params: Promise.resolve({ conversationId: "conv-a" }) },
    );

    expect(response.status).toBe(400);
    expect(mockSetConversationChannelSharing).not.toHaveBeenCalled();
  });

  it("returns unauthorized when the request identity cannot resolve to a user", async () => {
    mockResolveOrCreateUserIdForRequest.mockResolvedValue({
      userId: "",
      identity: { id: "", email: "", externalUserId: "", sessionKey: "" },
      tracking: null,
    });

    const response = await POST(
      postShareRequest({ enabled: true }),
      { params: Promise.resolve({ conversationId: "conv-a" }) },
    );

    expect(response.status).toBe(401);
    expect(mockSetConversationChannelSharing).not.toHaveBeenCalled();
  });
});

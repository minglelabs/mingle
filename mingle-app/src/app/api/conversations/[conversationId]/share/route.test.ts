import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  mockGetServerSession,
  mockGetConversationChannelSharing,
  mockCreateOrRefreshConversationShareLink,
  mockResolveOrCreateUserIdForRequest,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockGetConversationChannelSharing: vi.fn(),
  mockCreateOrRefreshConversationShareLink: vi.fn(),
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
  createOrRefreshConversationShareLink: mockCreateOrRefreshConversationShareLink,
}));

vi.mock("@/lib/request-user-identity", () => ({
  resolveOrCreateUserIdForRequest: mockResolveOrCreateUserIdForRequest,
}));

vi.mock("@/lib/app-analytics", () => ({
  ensureTrackingContext: vi.fn(),
}));

import { GET, POST } from "@/app/api/conversations/[conversationId]/share/route";

function postShareRequest() {
  return new NextRequest("https://example.com/api/conversations/conv-a/share", {
    method: "POST",
  });
}

describe("/api/conversations/[conversationId]/share route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSession.mockResolvedValue(null);
    mockResolveOrCreateUserIdForRequest.mockResolvedValue({
      userId: "user-a",
      identity: { id: "user-a", email: "", externalUserId: "", sessionKey: "" },
      tracking: null,
    });
  });

  it("returns sharing status for any member", async () => {
    mockGetConversationChannelSharing.mockResolvedValue({ shareToken: "tok-a", sharedAt: new Date("2026-01-01T00:00:00.000Z") });

    const response = await GET(
      new NextRequest("https://example.com/api/conversations/conv-a/share"),
      { params: Promise.resolve({ conversationId: "conv-a" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ shareToken: "tok-a", sharedAt: "2026-01-01T00:00:00.000Z" });
    expect(mockGetConversationChannelSharing).toHaveBeenCalledWith({
      conversationId: "conv-a",
      userId: "user-a",
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

  it("creates or refreshes the share link and returns the share token", async () => {
    mockCreateOrRefreshConversationShareLink.mockResolvedValue({
      id: "conv-a",
      shareToken: "tok-a",
    });

    const response = await POST(
      postShareRequest(),
      { params: Promise.resolve({ conversationId: "conv-a" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.shareToken).toBe("tok-a");
    expect(mockCreateOrRefreshConversationShareLink).toHaveBeenCalledWith({
      conversationId: "conv-a",
      userId: "user-a",
    });
  });

  it("returns not_found when the caller isn't a member of the room", async () => {
    mockCreateOrRefreshConversationShareLink.mockResolvedValue(null);

    const response = await POST(
      postShareRequest(),
      { params: Promise.resolve({ conversationId: "conv-a" }) },
    );

    expect(response.status).toBe(404);
  });

  it("returns unauthorized when the request identity cannot resolve to a user", async () => {
    mockResolveOrCreateUserIdForRequest.mockResolvedValue({
      userId: "",
      identity: { id: "", email: "", externalUserId: "", sessionKey: "" },
      tracking: null,
    });

    const response = await POST(
      postShareRequest(),
      { params: Promise.resolve({ conversationId: "conv-a" }) },
    );

    expect(response.status).toBe(401);
    expect(mockCreateOrRefreshConversationShareLink).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  mockGetServerSession,
  mockGetConversationChannelSharing,
  mockSetConversationShareEnabled,
  mockRefreshConversationShareSnapshot,
  mockResolveOrCreateUserIdForRequest,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockGetConversationChannelSharing: vi.fn(),
  mockSetConversationShareEnabled: vi.fn(),
  mockRefreshConversationShareSnapshot: vi.fn(),
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
  setConversationShareEnabled: mockSetConversationShareEnabled,
  refreshConversationShareSnapshot: mockRefreshConversationShareSnapshot,
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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
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
    mockGetConversationChannelSharing.mockResolvedValue({
      shareToken: "tok-a",
      shareEnabled: true,
      sharedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    const response = await GET(
      new NextRequest("https://example.com/api/conversations/conv-a/share"),
      { params: Promise.resolve({ conversationId: "conv-a" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ shareToken: "tok-a", shareEnabled: true, sharedAt: "2026-01-01T00:00:00.000Z" });
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

  it("toggles sharing on and returns the share token", async () => {
    mockSetConversationShareEnabled.mockResolvedValue({
      id: "conv-a",
      shareToken: "tok-a",
      shareEnabled: true,
    });

    const response = await POST(
      postShareRequest({ enabled: true }),
      { params: Promise.resolve({ conversationId: "conv-a" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.shareToken).toBe("tok-a");
    expect(json.shareEnabled).toBe(true);
    expect(mockSetConversationShareEnabled).toHaveBeenCalledWith({
      conversationId: "conv-a",
      userId: "user-a",
      enabled: true,
    });
    expect(mockRefreshConversationShareSnapshot).not.toHaveBeenCalled();
  });

  it("toggles sharing off", async () => {
    mockSetConversationShareEnabled.mockResolvedValue({
      id: "conv-a",
      shareToken: "tok-a",
      shareEnabled: false,
    });

    const response = await POST(
      postShareRequest({ enabled: false }),
      { params: Promise.resolve({ conversationId: "conv-a" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.shareEnabled).toBe(false);
    expect(mockSetConversationShareEnabled).toHaveBeenCalledWith({
      conversationId: "conv-a",
      userId: "user-a",
      enabled: false,
    });
  });

  it("refreshes the snapshot without touching the toggle", async () => {
    mockRefreshConversationShareSnapshot.mockResolvedValue({
      id: "conv-a",
      shareToken: "tok-a",
      shareEnabled: true,
    });

    const response = await POST(
      postShareRequest({ refresh: true }),
      { params: Promise.resolve({ conversationId: "conv-a" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.shareToken).toBe("tok-a");
    expect(mockRefreshConversationShareSnapshot).toHaveBeenCalledWith({
      conversationId: "conv-a",
      userId: "user-a",
    });
    expect(mockSetConversationShareEnabled).not.toHaveBeenCalled();
  });

  it("returns invalid_body when neither enabled nor refresh is given", async () => {
    const response = await POST(
      postShareRequest({}),
      { params: Promise.resolve({ conversationId: "conv-a" }) },
    );

    expect(response.status).toBe(400);
    expect(mockSetConversationShareEnabled).not.toHaveBeenCalled();
    expect(mockRefreshConversationShareSnapshot).not.toHaveBeenCalled();
  });

  it("returns invalid_body when both enabled and refresh are given", async () => {
    const response = await POST(
      postShareRequest({ enabled: true, refresh: true }),
      { params: Promise.resolve({ conversationId: "conv-a" }) },
    );

    expect(response.status).toBe(400);
  });

  it("returns not_found when the caller isn't a member of the room", async () => {
    mockSetConversationShareEnabled.mockResolvedValue(null);

    const response = await POST(
      postShareRequest({ enabled: true }),
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
      postShareRequest({ enabled: true }),
      { params: Promise.resolve({ conversationId: "conv-a" }) },
    );

    expect(response.status).toBe(401);
    expect(mockSetConversationShareEnabled).not.toHaveBeenCalled();
  });
});

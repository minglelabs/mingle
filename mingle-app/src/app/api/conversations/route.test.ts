import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const {
  mockGetServerSession,
  mockListConversationChannelsForUser,
  mockCreateConversationChannelForUser,
  mockEnsureTrackingContext,
  mockResolveOrCreateUserIdForRequest,
  mockSanitizeRequestIdentityValue,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockListConversationChannelsForUser: vi.fn(),
  mockCreateConversationChannelForUser: vi.fn(),
  mockEnsureTrackingContext: vi.fn(),
  mockResolveOrCreateUserIdForRequest: vi.fn(),
  mockSanitizeRequestIdentityValue: vi.fn((value: string) => value.trim()),
}));

vi.mock("next-auth", () => ({
  getServerSession: mockGetServerSession,
}));

vi.mock("@/lib/auth-options", () => ({
  getAuthOptions: () => ({}),
}));

vi.mock("@/lib/app-conversations", () => ({
  listConversationChannelsForUser: mockListConversationChannelsForUser,
  createConversationChannelForUser: mockCreateConversationChannelForUser,
}));

vi.mock("@/lib/app-analytics", () => ({
  ensureTrackingContext: mockEnsureTrackingContext,
}));

vi.mock("@/lib/request-user-identity", () => ({
  resolveOrCreateUserIdForRequest: mockResolveOrCreateUserIdForRequest,
  sanitizeRequestIdentityValue: mockSanitizeRequestIdentityValue,
}));

import { GET, POST } from "@/app/api/conversations/route";

describe("/api/conversations route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSession.mockResolvedValue(null);
    mockResolveOrCreateUserIdForRequest.mockResolvedValue({
      userId: "tracked_user_123",
      identity: {
        id: "",
        email: "",
        externalUserId: "anon_local_storage_user",
        sessionKey: "sess_local_storage_user",
      },
      tracking: {
        externalUserId: "anon_local_storage_user",
        sessionKey: "sess_local_storage_user",
      },
    });
    mockEnsureTrackingContext.mockReturnValue({
      externalUserId: "anon_local_storage_user",
      sessionKey: "sess_local_storage_user",
    });
  });

  it("lists conversations for a guest request identified by the header seed", async () => {
    mockListConversationChannelsForUser.mockResolvedValue([
      {
        id: "conv_1",
        sequenceNumber: 1,
        title: "Conversation (1)",
        status: "active",
        sessionKey: "conv_session_1",
        createdAt: "2026-04-02T00:00:00.000Z",
        updatedAt: "2026-04-02T00:01:00.000Z",
        pausedAt: null,
      },
    ]);

    const response = await GET(new NextRequest("https://example.com/api/conversations", {
      headers: {
        "x-mingle-user-id": "anon_local_storage_user",
      },
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      conversations: [
        {
          id: "conv_1",
          sequenceNumber: 1,
          title: "Conversation (1)",
          status: "active",
          sessionKey: "conv_session_1",
          createdAt: "2026-04-02T00:00:00.000Z",
          updatedAt: "2026-04-02T00:01:00.000Z",
          pausedAt: null,
        },
      ],
    });
    expect(mockResolveOrCreateUserIdForRequest).toHaveBeenCalledWith({
      request: expect.any(NextRequest),
      session: null,
    });
    expect(mockListConversationChannelsForUser).toHaveBeenCalledWith("tracked_user_123");
    expect(mockEnsureTrackingContext).toHaveBeenCalledWith(
      expect.any(NextRequest),
      expect.any(NextResponse),
      expect.objectContaining({
        externalUserIdHint: "anon_local_storage_user",
        sessionKeyHint: "sess_local_storage_user",
      }),
    );
  });

  it("creates a new conversation for a guest request", async () => {
    mockCreateConversationChannelForUser.mockResolvedValue({
      id: "conv_2",
      sequenceNumber: 2,
      title: "Conversation (2)",
      status: "paused",
      sessionKey: "conv_session_2",
      createdAt: "2026-04-02T00:02:00.000Z",
      updatedAt: "2026-04-02T00:02:00.000Z",
      pausedAt: "2026-04-02T00:02:00.000Z",
    });

    const response = await POST(new NextRequest("https://example.com/api/conversations", {
      method: "POST",
      headers: {
        "x-mingle-user-id": "anon_local_storage_user",
      },
    }));
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json).toEqual({
      conversation: {
        id: "conv_2",
        sequenceNumber: 2,
        title: "Conversation (2)",
        status: "paused",
        sessionKey: "conv_session_2",
        createdAt: "2026-04-02T00:02:00.000Z",
        updatedAt: "2026-04-02T00:02:00.000Z",
        pausedAt: "2026-04-02T00:02:00.000Z",
      },
    });
    expect(mockCreateConversationChannelForUser).toHaveBeenCalledWith("tracked_user_123", {
      preferredSessionKey: undefined,
    });
  });

  it("creates a new conversation seeded with the legacy single-room session key", async () => {
    mockCreateConversationChannelForUser.mockResolvedValue({
      id: "conv_legacy",
      sequenceNumber: 1,
      title: "Conversation (1)",
      status: "paused",
      sessionKey: "sess_legacy_room",
      createdAt: "2026-04-02T00:02:00.000Z",
      updatedAt: "2026-04-02T00:02:00.000Z",
      pausedAt: "2026-04-02T00:02:00.000Z",
    });

    const response = await POST(new NextRequest("https://example.com/api/conversations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-mingle-user-id": "anon_local_storage_user",
      },
      body: JSON.stringify({ legacySessionKey: "sess_legacy_room" }),
    }));
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json).toEqual({
      conversation: {
        id: "conv_legacy",
        sequenceNumber: 1,
        title: "Conversation (1)",
        status: "paused",
        sessionKey: "sess_legacy_room",
        createdAt: "2026-04-02T00:02:00.000Z",
        updatedAt: "2026-04-02T00:02:00.000Z",
        pausedAt: "2026-04-02T00:02:00.000Z",
      },
    });
    expect(mockCreateConversationChannelForUser).toHaveBeenCalledWith("tracked_user_123", {
      preferredSessionKey: "sess_legacy_room",
    });
  });

  it("returns unauthorized when the request identity cannot resolve to a user", async () => {
    mockResolveOrCreateUserIdForRequest.mockResolvedValue({
      userId: "",
      identity: {
        id: "",
        email: "",
        externalUserId: "",
        sessionKey: "",
      },
      tracking: null,
    });

    const response = await GET(new NextRequest("https://example.com/api/conversations"));
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json).toEqual({ error: "unauthorized" });
    expect(mockListConversationChannelsForUser).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  mockGetServerSession,
  mockCreateConversationChannelForUser,
  mockListConversationChannelsForUser,
  mockResolveOrCreateUserIdForRequest,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockCreateConversationChannelForUser: vi.fn(),
  mockListConversationChannelsForUser: vi.fn(),
  mockResolveOrCreateUserIdForRequest: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: mockGetServerSession,
}));

vi.mock("@/lib/auth-options", () => ({
  getAuthOptions: () => ({}),
}));

vi.mock("@/lib/app-conversations", () => ({
  createConversationChannelForUser: mockCreateConversationChannelForUser,
  listConversationChannelsForUser: mockListConversationChannelsForUser,
}));

vi.mock("@/lib/request-user-identity", () => ({
  resolveOrCreateUserIdForRequest: mockResolveOrCreateUserIdForRequest,
}));

import { GET, POST } from "@/app/api/conversations/route";

describe("/api/conversations route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns conversation list for a guest tracking user", async () => {
    mockGetServerSession.mockResolvedValue(null);
    mockResolveOrCreateUserIdForRequest.mockResolvedValue({
      userId: "guest_user_1",
      identity: {
        id: "",
        email: "",
        externalUserId: "anon_local_user",
        sessionKey: "sess_local_user",
      },
      tracking: {
        externalUserId: "anon_local_user",
        sessionKey: "sess_local_user",
      },
    });
    mockListConversationChannelsForUser.mockResolvedValue([]);

    const response = await GET(new NextRequest("http://localhost/api/conversations"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(mockResolveOrCreateUserIdForRequest).toHaveBeenCalled();
    expect(mockListConversationChannelsForUser).toHaveBeenCalledWith("guest_user_1");
    expect(json).toEqual({ conversations: [] });
  });

  it("returns conversation list for the current user", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "user_1" },
    });
    mockResolveOrCreateUserIdForRequest.mockResolvedValue({
      userId: "user_1",
      identity: {
        id: "user_1",
        email: "",
        externalUserId: "",
        sessionKey: "",
      },
      tracking: null,
    });
    mockListConversationChannelsForUser.mockResolvedValue([
      {
        id: "conv_1",
        sequenceNumber: 1,
        title: "Conversation (1)",
        status: "paused",
        sessionKey: "conv_session_1",
        createdAt: "2026-03-31T00:00:00.000Z",
        updatedAt: "2026-03-31T01:00:00.000Z",
        pausedAt: "2026-03-31T01:00:00.000Z",
      },
    ]);

    const response = await GET(new NextRequest("http://localhost/api/conversations"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(mockResolveOrCreateUserIdForRequest).toHaveBeenCalled();
    expect(mockListConversationChannelsForUser).toHaveBeenCalledWith("user_1");
    expect(json).toEqual({
      conversations: [
        {
          id: "conv_1",
          sequenceNumber: 1,
          title: "Conversation (1)",
          status: "paused",
          sessionKey: "conv_session_1",
          createdAt: "2026-03-31T00:00:00.000Z",
          updatedAt: "2026-03-31T01:00:00.000Z",
          pausedAt: "2026-03-31T01:00:00.000Z",
        },
      ],
    });
  });

  it("creates a conversation for the current user", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "user_1" },
    });
    mockResolveOrCreateUserIdForRequest.mockResolvedValue({
      userId: "user_1",
      identity: {
        id: "user_1",
        email: "",
        externalUserId: "",
        sessionKey: "",
      },
      tracking: null,
    });
    mockCreateConversationChannelForUser.mockResolvedValue({
      id: "conv_2",
      sequenceNumber: 2,
      title: "Conversation (2)",
      status: "active",
      sessionKey: "conv_session_2",
      createdAt: "2026-03-31T02:00:00.000Z",
      updatedAt: "2026-03-31T02:00:00.000Z",
      pausedAt: null,
    });

    const response = await POST(new NextRequest("http://localhost/api/conversations", {
      method: "POST",
    }));
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(mockResolveOrCreateUserIdForRequest).toHaveBeenCalled();
    expect(mockCreateConversationChannelForUser).toHaveBeenCalledWith("user_1");
    expect(json).toEqual({
      conversation: {
        id: "conv_2",
        sequenceNumber: 2,
        title: "Conversation (2)",
        status: "active",
        sessionKey: "conv_session_2",
        createdAt: "2026-03-31T02:00:00.000Z",
        updatedAt: "2026-03-31T02:00:00.000Z",
        pausedAt: null,
      },
    });
  });
});

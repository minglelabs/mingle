import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  mockGetServerSession,
  mockUpdateConversationChannelStatus,
  mockResolveOrCreateUserIdForRequest,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockUpdateConversationChannelStatus: vi.fn(),
  mockResolveOrCreateUserIdForRequest: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: mockGetServerSession,
}));

vi.mock("@/lib/auth-options", () => ({
  getAuthOptions: () => ({}),
}));

vi.mock("@/lib/app-conversations", () => ({
  APP_CONVERSATION_STATUS_ACTIVE: "active",
  APP_CONVERSATION_STATUS_PAUSED: "paused",
  normalizeConversationChannelStatus: (value: string) => (
    value.trim().toLowerCase() === "paused" ? "paused" : "active"
  ),
  updateConversationChannelStatus: mockUpdateConversationChannelStatus,
}));

vi.mock("@/lib/request-user-identity", () => ({
  resolveOrCreateUserIdForRequest: mockResolveOrCreateUserIdForRequest,
}));

import { PATCH } from "@/app/api/conversations/[conversationId]/route";

describe("/api/conversations/[conversationId] route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates conversation status for a guest tracking user", async () => {
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
    mockUpdateConversationChannelStatus.mockResolvedValue({
      id: "conv_1",
      sequenceNumber: 1,
      title: "Conversation (1)",
      status: "paused",
      sessionKey: "conv_session_1",
      createdAt: "2026-03-31T00:00:00.000Z",
      updatedAt: "2026-03-31T03:00:00.000Z",
      pausedAt: "2026-03-31T03:00:00.000Z",
    });

    const response = await PATCH(
      new NextRequest("http://localhost/api/conversations/conv_1", {
        method: "PATCH",
        body: JSON.stringify({ status: "paused" }),
      }),
      { params: Promise.resolve({ conversationId: "conv_1" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(mockResolveOrCreateUserIdForRequest).toHaveBeenCalled();
    expect(mockUpdateConversationChannelStatus).toHaveBeenCalledWith({
      conversationId: "conv_1",
      userId: "guest_user_1",
      status: "paused",
    });
    expect(json).toEqual({
      conversation: {
        id: "conv_1",
        sequenceNumber: 1,
        title: "Conversation (1)",
        status: "paused",
        sessionKey: "conv_session_1",
        createdAt: "2026-03-31T00:00:00.000Z",
        updatedAt: "2026-03-31T03:00:00.000Z",
        pausedAt: "2026-03-31T03:00:00.000Z",
      },
    });
  });

  it("returns 400 when status is invalid", async () => {
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

    const response = await PATCH(
      new NextRequest("http://localhost/api/conversations/conv_1", {
        method: "PATCH",
        body: JSON.stringify({ status: "archived" }),
      }),
      { params: Promise.resolve({ conversationId: "conv_1" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toEqual({ error: "invalid_status" });
    expect(mockUpdateConversationChannelStatus).not.toHaveBeenCalled();
  });

  it("returns 404 when conversation is missing", async () => {
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
    mockUpdateConversationChannelStatus.mockResolvedValue(null);

    const response = await PATCH(
      new NextRequest("http://localhost/api/conversations/conv_missing", {
        method: "PATCH",
        body: JSON.stringify({ status: "paused" }),
      }),
      { params: Promise.resolve({ conversationId: "conv_missing" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json).toEqual({ error: "not_found" });
    expect(mockUpdateConversationChannelStatus).toHaveBeenCalledWith({
      conversationId: "conv_missing",
      userId: "user_1",
      status: "paused",
    });
  });

  it("updates conversation status for the current user", async () => {
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
    mockUpdateConversationChannelStatus.mockResolvedValue({
      id: "conv_1",
      sequenceNumber: 1,
      title: "Conversation (1)",
      status: "paused",
      sessionKey: "conv_session_1",
      createdAt: "2026-03-31T00:00:00.000Z",
      updatedAt: "2026-03-31T03:00:00.000Z",
      pausedAt: "2026-03-31T03:00:00.000Z",
    });

    const response = await PATCH(
      new NextRequest("http://localhost/api/conversations/conv_1", {
        method: "PATCH",
        body: JSON.stringify({ status: "paused" }),
      }),
      { params: Promise.resolve({ conversationId: "conv_1" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(mockResolveOrCreateUserIdForRequest).toHaveBeenCalled();
    expect(mockUpdateConversationChannelStatus).toHaveBeenCalledWith({
      conversationId: "conv_1",
      userId: "user_1",
      status: "paused",
    });
    expect(json).toEqual({
      conversation: {
        id: "conv_1",
        sequenceNumber: 1,
        title: "Conversation (1)",
        status: "paused",
        sessionKey: "conv_session_1",
        createdAt: "2026-03-31T00:00:00.000Z",
        updatedAt: "2026-03-31T03:00:00.000Z",
        pausedAt: "2026-03-31T03:00:00.000Z",
      },
    });
  });
});

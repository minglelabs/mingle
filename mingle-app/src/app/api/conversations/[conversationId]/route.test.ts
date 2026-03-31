import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetServerSession,
  mockUpdateConversationChannelStatus,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockUpdateConversationChannelStatus: vi.fn(),
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

import { PATCH } from "@/app/api/conversations/[conversationId]/route";

describe("/api/conversations/[conversationId] route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when session is missing", async () => {
    mockGetServerSession.mockResolvedValue(null);

    const response = await PATCH(
      new Request("http://localhost/api/conversations/conv_1", {
        method: "PATCH",
        body: JSON.stringify({ status: "paused" }),
      }) as never,
      { params: Promise.resolve({ conversationId: "conv_1" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json).toEqual({ error: "unauthorized" });
  });

  it("returns 400 when status is invalid", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "user_1" },
    });

    const response = await PATCH(
      new Request("http://localhost/api/conversations/conv_1", {
        method: "PATCH",
        body: JSON.stringify({ status: "archived" }),
      }) as never,
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
    mockUpdateConversationChannelStatus.mockResolvedValue(null);

    const response = await PATCH(
      new Request("http://localhost/api/conversations/conv_missing", {
        method: "PATCH",
        body: JSON.stringify({ status: "paused" }),
      }) as never,
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
      new Request("http://localhost/api/conversations/conv_1", {
        method: "PATCH",
        body: JSON.stringify({ status: "paused" }),
      }) as never,
      { params: Promise.resolve({ conversationId: "conv_1" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
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

import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetServerSession,
  mockCreateConversationChannelForUser,
  mockListConversationChannelsForUser,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockCreateConversationChannelForUser: vi.fn(),
  mockListConversationChannelsForUser: vi.fn(),
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

import { GET, POST } from "@/app/api/conversations/route";

describe("/api/conversations route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 for GET when session is missing", async () => {
    mockGetServerSession.mockResolvedValue(null);

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json).toEqual({ error: "unauthorized" });
  });

  it("returns conversation list for the current user", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "user_1" },
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

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
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

    const response = await POST();
    const json = await response.json();

    expect(response.status).toBe(201);
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

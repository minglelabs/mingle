import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const {
  mockGetServerSession,
  mockGetConversationHydrationStateForUser,
  mockUpdateConversationChannelStatus,
  mockEnsureTrackingContext,
  mockResolveOrCreateUserIdForRequest,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockGetConversationHydrationStateForUser: vi.fn(),
  mockUpdateConversationChannelStatus: vi.fn(),
  mockEnsureTrackingContext: vi.fn(),
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
  getConversationHydrationStateForUser: mockGetConversationHydrationStateForUser,
  normalizeConversationChannelStatus: (status: string) => (
    status === "paused" ? "paused" : "active"
  ),
  updateConversationChannelStatus: mockUpdateConversationChannelStatus,
}));

vi.mock("@/lib/app-analytics", () => ({
  ensureTrackingContext: mockEnsureTrackingContext,
}));

vi.mock("@/lib/request-user-identity", () => ({
  resolveOrCreateUserIdForRequest: mockResolveOrCreateUserIdForRequest,
}));

import { GET, PATCH } from "@/app/api/conversations/[conversationId]/route";

describe("/api/conversations/[conversationId] route", () => {
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

  it("pauses a conversation for a guest request", async () => {
    mockUpdateConversationChannelStatus.mockResolvedValue({
      id: "conv_1",
      sequenceNumber: 1,
      title: "Conversation (1)",
      status: "paused",
      sessionKey: "conv_session_1",
      createdAt: "2026-04-02T00:00:00.000Z",
      updatedAt: "2026-04-02T00:03:00.000Z",
      pausedAt: "2026-04-02T00:03:00.000Z",
    });

    const response = await PATCH(
      new NextRequest("https://example.com/api/conversations/conv_1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "paused" }),
      }),
      { params: Promise.resolve({ conversationId: "conv_1" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      conversation: {
        id: "conv_1",
        sequenceNumber: 1,
        title: "Conversation (1)",
        status: "paused",
        sessionKey: "conv_session_1",
        createdAt: "2026-04-02T00:00:00.000Z",
        updatedAt: "2026-04-02T00:03:00.000Z",
        pausedAt: "2026-04-02T00:03:00.000Z",
      },
    });
    expect(mockUpdateConversationChannelStatus).toHaveBeenCalledWith({
      conversationId: "conv_1",
      userId: "tracked_user_123",
      status: "paused",
    });
    expect(mockEnsureTrackingContext).toHaveBeenCalledWith(
      expect.any(NextRequest),
      expect.any(NextResponse),
      expect.objectContaining({
        externalUserIdHint: "anon_local_storage_user",
        sessionKeyHint: "sess_local_storage_user",
      }),
    );
  });

  it("returns conversation hydration state for a guest request", async () => {
    mockGetConversationHydrationStateForUser.mockResolvedValue({
      conversation: {
        id: "conv_1",
        sequenceNumber: 1,
        title: "Conversation (1)",
        status: "paused",
        sessionKey: "conv_session_1",
        createdAt: "2026-04-02T00:00:00.000Z",
        updatedAt: "2026-04-02T00:03:00.000Z",
        pausedAt: "2026-04-02T00:03:00.000Z",
      },
      usageSec: 12,
      utterances: [
        {
          id: "u-1",
          originalText: "Hello",
          originalLang: "en",
          targetLanguages: ["ko"],
          translations: { ko: "안녕하세요" },
          translationFinalized: { ko: true },
          createdAtMs: 1712016000000,
        },
      ],
    });

    const response = await GET(
      new NextRequest("https://example.com/api/conversations/conv_1", {
        headers: {
          "x-mingle-user-id": "anon_local_storage_user",
        },
      }),
      { params: Promise.resolve({ conversationId: "conv_1" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      conversation: {
        id: "conv_1",
        sequenceNumber: 1,
        title: "Conversation (1)",
        status: "paused",
        sessionKey: "conv_session_1",
        createdAt: "2026-04-02T00:00:00.000Z",
        updatedAt: "2026-04-02T00:03:00.000Z",
        pausedAt: "2026-04-02T00:03:00.000Z",
      },
      usageSec: 12,
      utterances: [
        {
          id: "u-1",
          originalText: "Hello",
          originalLang: "en",
          targetLanguages: ["ko"],
          translations: { ko: "안녕하세요" },
          translationFinalized: { ko: true },
          createdAtMs: 1712016000000,
        },
      ],
    });
    expect(mockGetConversationHydrationStateForUser).toHaveBeenCalledWith({
      conversationId: "conv_1",
      userId: "tracked_user_123",
    });
  });

  it("rejects invalid statuses", async () => {
    const response = await PATCH(
      new NextRequest("https://example.com/api/conversations/conv_1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "archived" }),
      }),
      { params: Promise.resolve({ conversationId: "conv_1" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toEqual({ error: "invalid_status" });
    expect(mockUpdateConversationChannelStatus).not.toHaveBeenCalled();
  });

  it("returns not found when the conversation is missing", async () => {
    mockUpdateConversationChannelStatus.mockResolvedValue(null);

    const response = await PATCH(
      new NextRequest("https://example.com/api/conversations/missing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      }),
      { params: Promise.resolve({ conversationId: "missing" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json).toEqual({ error: "not_found" });
  });
});

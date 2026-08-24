import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  mockAppMessageUpsert,
  mockAppMessageContentUpsert,
  mockAppEventLogFindFirst,
  mockCreateTrackedEventLog,
  mockEnsureTrackingContext,
  mockUpsertTrackedUser,
  mockMaybeGenerateConversationTitleForSession,
  mockNotifyConversationMessage,
  mockSendPushNotificationForConversationMessage,
  mockMaterializePendingConversationInvitees,
  mockIsMessageSenderBlockedInConversation,
  mockListChannelMemberUserIdsBySessionKey,
  mockGetServerSession,
  mockResolveSessionAwareUserId,
} = vi.hoisted(() => ({
  mockAppMessageUpsert: vi.fn(),
  mockAppMessageContentUpsert: vi.fn(),
  mockAppEventLogFindFirst: vi.fn(),
  mockCreateTrackedEventLog: vi.fn(),
  mockEnsureTrackingContext: vi.fn(),
  mockUpsertTrackedUser: vi.fn(),
  mockMaybeGenerateConversationTitleForSession: vi.fn(),
  mockNotifyConversationMessage: vi.fn(),
  mockSendPushNotificationForConversationMessage: vi.fn(),
  mockMaterializePendingConversationInvitees: vi.fn(),
  mockIsMessageSenderBlockedInConversation: vi.fn(),
  mockListChannelMemberUserIdsBySessionKey: vi.fn(),
  mockGetServerSession: vi.fn(),
  mockResolveSessionAwareUserId: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: mockGetServerSession,
}));

vi.mock("@/lib/auth-options", () => ({
  getAuthOptions: () => ({}),
}));

vi.mock("@/lib/request-user-identity", () => ({
  resolveSessionAwareUserId: mockResolveSessionAwareUserId,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    appMessage: {
      upsert: mockAppMessageUpsert,
    },
    appMessageContent: {
      upsert: mockAppMessageContentUpsert,
    },
    appEventLog: {
      findFirst: mockAppEventLogFindFirst,
    },
  },
}));

vi.mock("@/lib/app-analytics", () => ({
  createTrackedEventLog: mockCreateTrackedEventLog,
  ensureTrackingContext: mockEnsureTrackingContext,
  parseClientContext: () => ({}),
  sanitizeNonNegativeInt: (value: unknown) => {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
    return Math.trunc(value);
  },
  upsertTrackedUser: mockUpsertTrackedUser,
}));

vi.mock("@/server/conversation-auto-title", () => ({
  maybeGenerateConversationTitleForSession: mockMaybeGenerateConversationTitleForSession,
}));

vi.mock("@/server/conversation-realtime", () => ({
  notifyConversationMessage: mockNotifyConversationMessage,
}));

vi.mock("@/server/push-notifications", () => ({
  sendPushNotificationForConversationMessage: mockSendPushNotificationForConversationMessage,
}));

vi.mock("@/lib/app-conversations", () => ({
  materializePendingConversationInvitees: mockMaterializePendingConversationInvitees,
  isMessageSenderBlockedInConversation: mockIsMessageSenderBlockedInConversation,
  listChannelMemberUserIdsBySessionKey: mockListChannelMemberUserIdsBySessionKey,
}));

import { handleLogClientEventV1 } from "@/server/api/handlers/v1/log-client-event-handler";

describe("handleLogClientEventV1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnsureTrackingContext.mockReturnValue({ sessionKey: "sess_123" });
    mockUpsertTrackedUser.mockResolvedValue("user_123");
    mockGetServerSession.mockResolvedValue(null);
    mockResolveSessionAwareUserId.mockImplementation(
      async ({ fallbackUserId }: { fallbackUserId: string }) => fallbackUserId,
    );
    mockAppMessageUpsert.mockResolvedValue({ id: "message_123" });
    mockAppMessageContentUpsert.mockResolvedValue({});
    mockAppEventLogFindFirst.mockResolvedValue(null);
    mockCreateTrackedEventLog.mockResolvedValue(undefined);
    mockMaybeGenerateConversationTitleForSession.mockResolvedValue(undefined);
    mockSendPushNotificationForConversationMessage.mockResolvedValue(undefined);
    mockMaterializePendingConversationInvitees.mockResolvedValue(undefined);
    mockIsMessageSenderBlockedInConversation.mockResolvedValue(false);
    mockListChannelMemberUserIdsBySessionKey.mockResolvedValue(["user_123"]);
  });

  it("persists translation model and infrastructure provider for finalized turns", async () => {
    const request = new NextRequest("https://example.com/api/ios/v1.0.6/log/client-event", {
      method: "POST",
      body: JSON.stringify({
        eventType: "stt_turn_finalized",
        sessionKey: "sess_123",
        clientMessageId: "client_message_123",
        sourceLanguage: "ko",
        sourceText: "안녕하세요",
        provider: "qwen",
        infrastructureProvider: "openrouter",
        model: "qwen/qwen3.5-9b",
        translationPromptTokens: 321,
        translationCompletionTokens: 123,
        translationTotalTokens: 444,
        translations: {
          en: "Hello",
          ja: "こんにちは",
        },
      }),
    });

    const response = await handleLogClientEventV1(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true });
    expect(mockAppMessageUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          translationProvider: "openrouter",
          translationModel: "qwen/qwen3.5-9b",
          translationPromptTokens: 321,
          translationCompletionTokens: 123,
          translationTotalTokens: 444,
        }),
        update: expect.objectContaining({
          translationProvider: "openrouter",
          translationModel: "qwen/qwen3.5-9b",
          translationPromptTokens: 321,
          translationCompletionTokens: 123,
          translationTotalTokens: 444,
        }),
      }),
    );
    expect(mockAppMessageContentUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          contentType: "SOURCE",
          provider: "openrouter",
          model: "qwen/qwen3.5-9b",
        }),
      }),
    );
    expect(mockAppMessageContentUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          contentType: "TRANSLATION_FINAL",
          language: "en",
          provider: "openrouter",
          model: "qwen/qwen3.5-9b",
        }),
      }),
    );
    expect(mockAppMessageContentUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          contentType: "TRANSLATION_FINAL",
          language: "ja",
          provider: "openrouter",
          model: "qwen/qwen3.5-9b",
        }),
      }),
    );
    expect(mockMaybeGenerateConversationTitleForSession).toHaveBeenCalledWith({
      sessionKey: "sess_123",
    });
    // Materializes any pending invitee into a real member before the
    // realtime notify, so a freshly-materialized member's own push actually
    // reaches them for this first message.
    expect(mockMaterializePendingConversationInvitees).toHaveBeenCalledWith("sess_123");
    expect(mockNotifyConversationMessage).toHaveBeenCalledWith("sess_123", ["user_123"]);
    expect(mockSendPushNotificationForConversationMessage).toHaveBeenCalledWith({
      messageId: "message_123",
      sessionKey: "sess_123",
      sourceText: "안녕하세요",
      senderUserId: "user_123",
      memberUserIds: ["user_123"],
    });
  });

  it("notifies every real member's list topic, not just the room's own sessionKey", async () => {
    mockListChannelMemberUserIdsBySessionKey.mockResolvedValue(["user_123", "user_456"]);

    const request = new NextRequest("https://example.com/api/ios/v1.0.6/log/client-event", {
      method: "POST",
      body: JSON.stringify({
        eventType: "stt_turn_finalized",
        sessionKey: "sess_123",
        clientMessageId: "client_message_multi",
        sourceLanguage: "ko",
        sourceText: "안녕하세요",
        translations: {},
      }),
    });

    const response = await handleLogClientEventV1(request);
    expect(response.status).toBe(200);
    expect(mockListChannelMemberUserIdsBySessionKey).toHaveBeenCalledWith("sess_123");
    expect(mockNotifyConversationMessage).toHaveBeenCalledWith("sess_123", ["user_123", "user_456"]);
    expect(mockSendPushNotificationForConversationMessage).toHaveBeenCalledWith({
      messageId: "message_123",
      sessionKey: "sess_123",
      sourceText: "안녕하세요",
      senderUserId: "user_123",
      memberUserIds: ["user_123", "user_456"],
    });
  });

  it("uses the committed first-message membership set for realtime and push fan-out", async () => {
    mockMaterializePendingConversationInvitees.mockResolvedValue(["user_123", "user_456"]);
    mockListChannelMemberUserIdsBySessionKey.mockResolvedValue(["user_123"]);

    const request = new NextRequest("https://example.com/api/ios/v1.0.6/log/client-event", {
      method: "POST",
      body: JSON.stringify({
        eventType: "stt_turn_finalized",
        sessionKey: "sess_123",
        clientMessageId: "client_message_committed_members",
        sourceLanguage: "ko",
        sourceText: "안녕하세요",
        translations: {},
      }),
    });

    const response = await handleLogClientEventV1(request);

    expect(response.status).toBe(200);
    expect(mockListChannelMemberUserIdsBySessionKey).not.toHaveBeenCalled();
    expect(mockNotifyConversationMessage).toHaveBeenCalledWith("sess_123", ["user_123", "user_456"]);
    expect(mockSendPushNotificationForConversationMessage).toHaveBeenCalledWith({
      messageId: "message_123",
      sessionKey: "sess_123",
      sourceText: "안녕하세요",
      senderUserId: "user_123",
      memberUserIds: ["user_123", "user_456"],
    });
  });

  it("still notifies the room even when fetching member ids for the list fan-out fails", async () => {
    mockListChannelMemberUserIdsBySessionKey.mockRejectedValue(new Error("db_unavailable"));

    const request = new NextRequest("https://example.com/api/ios/v1.0.6/log/client-event", {
      method: "POST",
      body: JSON.stringify({
        eventType: "stt_turn_finalized",
        sessionKey: "sess_123",
        clientMessageId: "client_message_member_lookup_failure",
        sourceLanguage: "ko",
        sourceText: "안녕하세요",
        translations: {},
      }),
    });

    const response = await handleLogClientEventV1(request);
    expect(response.status).toBe(200);
    expect(mockNotifyConversationMessage).toHaveBeenCalledWith("sess_123", []);
  });

  it("still persists the message and notifies even if materializing pending invitees fails", async () => {
    mockMaterializePendingConversationInvitees.mockRejectedValue(new Error("db_unavailable"));

    const request = new NextRequest("https://example.com/api/ios/v1.0.6/log/client-event", {
      method: "POST",
      body: JSON.stringify({
        eventType: "stt_turn_finalized",
        sessionKey: "sess_123",
        clientMessageId: "client_message_789",
        sourceLanguage: "ko",
        sourceText: "안녕하세요",
        translations: {},
      }),
    });

    const response = await handleLogClientEventV1(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true });
    expect(mockAppMessageUpsert).toHaveBeenCalled();
    expect(mockNotifyConversationMessage).toHaveBeenCalledWith("sess_123", ["user_123"]);
  });

  it("does not persist or notify a finalized turn when the sender is blocked or not a member", async () => {
    mockIsMessageSenderBlockedInConversation.mockResolvedValue(true);

    const request = new NextRequest("https://example.com/api/ios/v1.0.6/log/client-event", {
      method: "POST",
      body: JSON.stringify({
        eventType: "stt_turn_finalized",
        sessionKey: "sess_123",
        clientMessageId: "client_message_blocked",
        sourceLanguage: "ko",
        sourceText: "안녕하세요",
        translations: {},
      }),
    });

    const response = await handleLogClientEventV1(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true });
    expect(mockAppMessageUpsert).not.toHaveBeenCalled();
    expect(mockAppMessageContentUpsert).not.toHaveBeenCalled();
    expect(mockMaterializePendingConversationInvitees).not.toHaveBeenCalled();
    expect(mockNotifyConversationMessage).not.toHaveBeenCalled();
  });

  it("ignores stale finalized turns after the conversation was cleared", async () => {
    mockAppEventLogFindFirst.mockResolvedValue({
      createdAt: new Date("2026-04-09T00:00:00.000Z"),
      metadata: {
        clientClearedAtMs: 1700000000500,
      },
    });

    const request = new NextRequest("https://example.com/api/ios/v1.0.11/log/client-event", {
      method: "POST",
      body: JSON.stringify({
        eventType: "stt_turn_finalized",
        sessionKey: "sess_123",
        clientMessageId: "u-1700000000000-1",
        sourceLanguage: "ko",
        sourceText: "안녕하세요",
        translations: {
          en: "Hello",
        },
      }),
    });

    const response = await handleLogClientEventV1(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true });
    expect(mockAppMessageUpsert).not.toHaveBeenCalled();
    expect(mockAppMessageContentUpsert).not.toHaveBeenCalled();
    expect(mockCreateTrackedEventLog).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: null,
      }),
    );
    expect(mockNotifyConversationMessage).not.toHaveBeenCalled();
  });

  it("attributes a finalized turn to the account resolveSessionAwareUserId resolves, not the raw tracked id", async () => {
    const session = { user: { id: "user_session_real" } };
    mockGetServerSession.mockResolvedValue(session);
    mockResolveSessionAwareUserId.mockResolvedValue("user_session_real");

    const request = new NextRequest("https://example.com/api/ios/v1.0.6/log/client-event", {
      method: "POST",
      body: JSON.stringify({
        eventType: "stt_turn_finalized",
        sessionKey: "sess_123",
        clientMessageId: "client_message_456",
        sourceLanguage: "ko",
        sourceText: "안녕하세요",
        translations: {},
      }),
    });

    const response = await handleLogClientEventV1(request);

    expect(response.status).toBe(200);
    expect(mockAppMessageUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          user: { connect: { id: "user_session_real" } },
        }),
        update: expect.objectContaining({
          user: { connect: { id: "user_session_real" } },
        }),
      }),
    );
    expect(mockCreateTrackedEventLog).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user_session_real" }),
    );
    expect(mockResolveSessionAwareUserId).toHaveBeenCalledWith({
      session,
      fallbackUserId: "user_123",
    });
  });
});

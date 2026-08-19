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
} = vi.hoisted(() => ({
  mockAppMessageUpsert: vi.fn(),
  mockAppMessageContentUpsert: vi.fn(),
  mockAppEventLogFindFirst: vi.fn(),
  mockCreateTrackedEventLog: vi.fn(),
  mockEnsureTrackingContext: vi.fn(),
  mockUpsertTrackedUser: vi.fn(),
  mockMaybeGenerateConversationTitleForSession: vi.fn(),
  mockNotifyConversationMessage: vi.fn(),
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

import { handleLogClientEventV1 } from "@/server/api/handlers/v1/log-client-event-handler";

describe("handleLogClientEventV1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnsureTrackingContext.mockReturnValue({ sessionKey: "sess_123" });
    mockUpsertTrackedUser.mockResolvedValue("user_123");
    mockAppMessageUpsert.mockResolvedValue({ id: "message_123" });
    mockAppMessageContentUpsert.mockResolvedValue({});
    mockAppEventLogFindFirst.mockResolvedValue(null);
    mockCreateTrackedEventLog.mockResolvedValue(undefined);
    mockMaybeGenerateConversationTitleForSession.mockResolvedValue(undefined);
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
    expect(mockNotifyConversationMessage).toHaveBeenCalledWith("sess_123");
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
});

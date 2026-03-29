import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  mockAppMessageUpsert,
  mockAppMessageContentUpsert,
  mockCreateTrackedEventLog,
  mockEnsureTrackingContext,
  mockUpsertTrackedUser,
} = vi.hoisted(() => ({
  mockAppMessageUpsert: vi.fn(),
  mockAppMessageContentUpsert: vi.fn(),
  mockCreateTrackedEventLog: vi.fn(),
  mockEnsureTrackingContext: vi.fn(),
  mockUpsertTrackedUser: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    appMessage: {
      upsert: mockAppMessageUpsert,
    },
    appMessageContent: {
      upsert: mockAppMessageContentUpsert,
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

import { handleLogClientEventV1 } from "@/server/api/handlers/v1/log-client-event-handler";

describe("handleLogClientEventV1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnsureTrackingContext.mockReturnValue({ sessionKey: "sess_123" });
    mockUpsertTrackedUser.mockResolvedValue("user_123");
    mockAppMessageUpsert.mockResolvedValue({ id: "message_123" });
    mockAppMessageContentUpsert.mockResolvedValue({});
    mockCreateTrackedEventLog.mockResolvedValue(undefined);
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
  });
});

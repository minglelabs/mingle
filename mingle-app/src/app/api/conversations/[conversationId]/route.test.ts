import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const {
  mockDeleteConversationChannel,
  mockGetServerSession,
  mockGetConversationHydrationStateForUser,
  mockUpdateConversationChannelStatus,
  mockUpdateConversationChannelSelectedLanguages,
  mockUpdateConversationChannelSpeechLanguages,
  mockUpdateConversationChannelTranslationLanguagesLinked,
  mockUpdateConversationChannelTitle,
  mockEnsureTrackingContext,
  mockResolveOrCreateUserIdForRequest,
  mockSanitizeSttLanguageSelection,
} = vi.hoisted(() => ({
  mockDeleteConversationChannel: vi.fn(),
  mockGetServerSession: vi.fn(),
  mockGetConversationHydrationStateForUser: vi.fn(),
  mockUpdateConversationChannelStatus: vi.fn(),
  mockUpdateConversationChannelSelectedLanguages: vi.fn(),
  mockUpdateConversationChannelSpeechLanguages: vi.fn(),
  mockUpdateConversationChannelTranslationLanguagesLinked: vi.fn(),
  mockUpdateConversationChannelTitle: vi.fn(),
  mockEnsureTrackingContext: vi.fn(),
  mockResolveOrCreateUserIdForRequest: vi.fn(),
  mockSanitizeSttLanguageSelection: vi.fn((value: unknown) => Array.isArray(value) ? value : []),
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
  deleteConversationChannel: mockDeleteConversationChannel,
  getConversationHydrationStateForUser: mockGetConversationHydrationStateForUser,
  normalizeConversationChannelStatus: (status: string) => (
    status === "paused" ? "paused" : "active"
  ),
  updateConversationChannelStatus: mockUpdateConversationChannelStatus,
  updateConversationChannelSelectedLanguages: mockUpdateConversationChannelSelectedLanguages,
  updateConversationChannelSpeechLanguages: mockUpdateConversationChannelSpeechLanguages,
  updateConversationChannelTranslationLanguagesLinked: mockUpdateConversationChannelTranslationLanguagesLinked,
  updateConversationChannelTitle: mockUpdateConversationChannelTitle,
}));

vi.mock("@/lib/app-analytics", () => ({
  ensureTrackingContext: mockEnsureTrackingContext,
}));

vi.mock("@/lib/stt-languages", () => ({
  sanitizeSttLanguageSelection: mockSanitizeSttLanguageSelection,
}));

vi.mock("@/lib/request-user-identity", () => ({
  resolveOrCreateUserIdForRequest: mockResolveOrCreateUserIdForRequest,
}));

import { DELETE, GET, PATCH } from "@/app/api/conversations/[conversationId]/route";

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
      selectedLanguages: ["en", "ko", "ja"],
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
        selectedLanguages: ["en", "ko", "ja"],
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
        selectedLanguages: ["en", "ko", "ja"],
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
        selectedLanguages: ["en", "ko", "ja"],
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

  it("soft deletes a conversation room for a guest request", async () => {
    mockDeleteConversationChannel.mockResolvedValue({
      id: "conv_1",
      sequenceNumber: 1,
      title: "Conversation 1",
      status: "paused",
      sessionKey: "conv_session_1",
      selectedLanguages: ["en", "ko"],
      createdAt: "2026-04-02T00:00:00.000Z",
      updatedAt: "2026-04-02T00:03:00.000Z",
      pausedAt: "2026-04-02T00:03:00.000Z",
    });

    const response = await DELETE(
      new NextRequest("https://example.com/api/conversations/conv_1", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ conversationId: "conv_1" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      deletedConversationId: "conv_1",
    });
    expect(mockDeleteConversationChannel).toHaveBeenCalledWith({
      conversationId: "conv_1",
      userId: "tracked_user_123",
    });
  });

  it("updates selected languages for a guest request", async () => {
    mockSanitizeSttLanguageSelection.mockReturnValue(["en", "fr"]);
    mockUpdateConversationChannelSelectedLanguages.mockResolvedValue({
      id: "conv_1",
      sequenceNumber: 1,
      title: "Conversation (1)",
      status: "paused",
      sessionKey: "conv_session_1",
      selectedLanguages: ["en", "fr"],
      createdAt: "2026-04-02T00:00:00.000Z",
      updatedAt: "2026-04-02T00:03:00.000Z",
      pausedAt: "2026-04-02T00:03:00.000Z",
    });

    const response = await PATCH(
      new NextRequest("https://example.com/api/conversations/conv_1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedLanguages: ["en", "fr"] }),
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
        selectedLanguages: ["en", "fr"],
        createdAt: "2026-04-02T00:00:00.000Z",
        updatedAt: "2026-04-02T00:03:00.000Z",
        pausedAt: "2026-04-02T00:03:00.000Z",
      },
    });
    expect(mockUpdateConversationChannelSelectedLanguages).toHaveBeenCalledWith({
      conversationId: "conv_1",
      userId: "tracked_user_123",
      selectedLanguages: ["en", "fr"],
    });
  });

  it("updates speech recognition languages for a guest request", async () => {
    mockSanitizeSttLanguageSelection.mockReturnValue(["ko", "ja"]);
    mockUpdateConversationChannelSpeechLanguages.mockResolvedValue({
      id: "conv_1",
      sequenceNumber: 1,
      title: "Conversation (1)",
      status: "paused",
      sessionKey: "conv_session_1",
      selectedLanguages: ["en", "fr"],
      speechLanguages: ["ko", "ja"],
      createdAt: "2026-04-02T00:00:00.000Z",
      updatedAt: "2026-04-02T00:03:00.000Z",
      pausedAt: "2026-04-02T00:03:00.000Z",
    });

    const response = await PATCH(
      new NextRequest("https://example.com/api/conversations/conv_1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ speechLanguages: ["ko", "ja"] }),
      }),
      { params: Promise.resolve({ conversationId: "conv_1" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.conversation?.speechLanguages).toEqual(["ko", "ja"]);
    expect(mockUpdateConversationChannelSpeechLanguages).toHaveBeenCalledWith({
      conversationId: "conv_1",
      userId: "tracked_user_123",
      speechLanguages: ["ko", "ja"],
    });
  });

  it("updates the translation language link setting for a guest request", async () => {
    mockUpdateConversationChannelTranslationLanguagesLinked.mockResolvedValue({
      id: "conv_1",
      sequenceNumber: 1,
      title: "Conversation (1)",
      status: "paused",
      sessionKey: "conv_session_1",
      selectedLanguages: ["ko", "ja"],
      speechLanguages: ["ko", "ja"],
      translationLanguagesLinked: true,
      createdAt: "2026-04-02T00:00:00.000Z",
      updatedAt: "2026-04-02T00:03:00.000Z",
      pausedAt: "2026-04-02T00:03:00.000Z",
    });

    const response = await PATCH(
      new NextRequest("https://example.com/api/conversations/conv_1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ translationLanguagesLinked: true }),
      }),
      { params: Promise.resolve({ conversationId: "conv_1" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.conversation?.translationLanguagesLinked).toBe(true);
    expect(mockUpdateConversationChannelTranslationLanguagesLinked).toHaveBeenCalledWith({
      conversationId: "conv_1",
      userId: "tracked_user_123",
      translationLanguagesLinked: true,
    });
  });

  it("rejects invalid selected languages", async () => {
    mockSanitizeSttLanguageSelection.mockReturnValue([]);

    const response = await PATCH(
      new NextRequest("https://example.com/api/conversations/conv_1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedLanguages: [] }),
      }),
      { params: Promise.resolve({ conversationId: "conv_1" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toEqual({ error: "invalid_selected_languages" });
    expect(mockUpdateConversationChannelSelectedLanguages).not.toHaveBeenCalled();
    expect(mockUpdateConversationChannelSpeechLanguages).not.toHaveBeenCalled();
    expect(mockUpdateConversationChannelTranslationLanguagesLinked).not.toHaveBeenCalled();
    expect(mockUpdateConversationChannelStatus).not.toHaveBeenCalled();
    expect(mockUpdateConversationChannelTitle).not.toHaveBeenCalled();
  });

  it("rejects invalid speech recognition languages", async () => {
    mockSanitizeSttLanguageSelection.mockReturnValue([]);

    const response = await PATCH(
      new NextRequest("https://example.com/api/conversations/conv_1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ speechLanguages: [] }),
      }),
      { params: Promise.resolve({ conversationId: "conv_1" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toEqual({ error: "invalid_speech_languages" });
    expect(mockUpdateConversationChannelSpeechLanguages).not.toHaveBeenCalled();
    expect(mockUpdateConversationChannelSelectedLanguages).not.toHaveBeenCalled();
    expect(mockUpdateConversationChannelTranslationLanguagesLinked).not.toHaveBeenCalled();
    expect(mockUpdateConversationChannelStatus).not.toHaveBeenCalled();
    expect(mockUpdateConversationChannelTitle).not.toHaveBeenCalled();
  });

  it("rejects invalid translation language link values", async () => {
    const response = await PATCH(
      new NextRequest("https://example.com/api/conversations/conv_1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ translationLanguagesLinked: "true" }),
      }),
      { params: Promise.resolve({ conversationId: "conv_1" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toEqual({ error: "invalid_translation_languages_linked" });
    expect(mockUpdateConversationChannelTranslationLanguagesLinked).not.toHaveBeenCalled();
    expect(mockUpdateConversationChannelSelectedLanguages).not.toHaveBeenCalled();
    expect(mockUpdateConversationChannelSpeechLanguages).not.toHaveBeenCalled();
    expect(mockUpdateConversationChannelStatus).not.toHaveBeenCalled();
    expect(mockUpdateConversationChannelTitle).not.toHaveBeenCalled();
  });

  it("updates the conversation title", async () => {
    mockUpdateConversationChannelTitle.mockResolvedValue({
      id: "conv_1",
      sequenceNumber: 1,
      title: "Trip planning",
      status: "paused",
      sessionKey: "conv_session_1",
      selectedLanguages: ["en", "ko", "ja"],
      createdAt: "2026-04-02T00:00:00.000Z",
      updatedAt: "2026-04-02T00:03:00.000Z",
      pausedAt: "2026-04-02T00:03:00.000Z",
    });

    const response = await PATCH(
      new NextRequest("https://example.com/api/conversations/conv_1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Trip planning" }),
      }),
      { params: Promise.resolve({ conversationId: "conv_1" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.conversation?.title).toBe("Trip planning");
    expect(mockUpdateConversationChannelTitle).toHaveBeenCalledWith({
      conversationId: "conv_1",
      userId: "tracked_user_123",
      title: "Trip planning",
    });
  });

  it("rejects empty conversation titles", async () => {
    const response = await PATCH(
      new NextRequest("https://example.com/api/conversations/conv_1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "   " }),
      }),
      { params: Promise.resolve({ conversationId: "conv_1" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toEqual({ error: "invalid_title" });
    expect(mockUpdateConversationChannelTitle).not.toHaveBeenCalled();
  });

  it("validates the whole patch body before mutating the conversation", async () => {
    mockSanitizeSttLanguageSelection.mockReturnValue(["en"]);

    const response = await PATCH(
      new NextRequest("https://example.com/api/conversations/conv_1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedLanguages: ["en"], status: "archived" }),
      }),
      { params: Promise.resolve({ conversationId: "conv_1" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toEqual({ error: "invalid_status" });
    expect(mockUpdateConversationChannelSelectedLanguages).not.toHaveBeenCalled();
    expect(mockUpdateConversationChannelSpeechLanguages).not.toHaveBeenCalled();
    expect(mockUpdateConversationChannelTranslationLanguagesLinked).not.toHaveBeenCalled();
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

import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockFindConversationMany,
  mockFindConversationFirst,
  mockUpdateConversation,
  mockAppMessageFindMany,
  mockAppMessageCount,
  mockAppMessageGroupBy,
  mockAppEventLogFindFirst,
} = vi.hoisted(() => ({
  mockFindConversationMany: vi.fn(),
  mockFindConversationFirst: vi.fn(),
  mockUpdateConversation: vi.fn(),
  mockAppMessageFindMany: vi.fn(),
  mockAppMessageCount: vi.fn(),
  mockAppMessageGroupBy: vi.fn(),
  mockAppEventLogFindFirst: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    appConversationChannel: {
      findMany: mockFindConversationMany,
      findFirst: mockFindConversationFirst,
      update: mockUpdateConversation,
    },
    appMessage: {
      findMany: mockAppMessageFindMany,
      count: mockAppMessageCount,
      groupBy: mockAppMessageGroupBy,
    },
    appEventLog: {
      findFirst: mockAppEventLogFindFirst,
    },
    $transaction: vi.fn(async (operations: Promise<unknown>[]) => Promise.all(operations)),
  },
}));

vi.mock("@/lib/stt-languages", () => ({
  sanitizeSttLanguageSelection: (value: unknown) => Array.isArray(value) ? value : [],
}));

vi.mock("@/i18n/conversations", () => ({
  formatLocalizedConversationTitle: (sequenceNumber: number, locale: string) => `${locale}:${sequenceNumber}`,
}));

import {
  CONVERSATION_HYDRATION_MESSAGE_LIMIT,
  deleteConversationChannel,
  getConversationHydrationStateForUser,
  listConversationChannelsForUser,
} from "@/lib/app-conversations";

describe("app-conversations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAppMessageGroupBy.mockResolvedValue([]);
  });

  it("treats isDeleted = null as visible when listing conversations", async () => {
    mockFindConversationMany.mockResolvedValue([]);
    mockAppMessageFindMany.mockResolvedValue([]);

    await listConversationChannelsForUser("user-1");

    expect(mockFindConversationMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        ownerUserId: "user-1",
        OR: [
          { isDeleted: false },
          { isDeleted: null },
        ],
      },
    }));
  });

  it("orders listed conversations by latest finalized message time instead of stale updatedAt", async () => {
    mockFindConversationMany.mockResolvedValue([
      {
        id: "conv-a",
        sequenceNumber: 1,
        title: "Conversation (1)",
        status: "paused",
        sessionKey: "session-a",
        selectedLanguages: ["en", "ko"],
        speechLanguages: ["en"],
        translationLanguagesLinked: true,
        createdAt: new Date("2026-04-12T09:00:00.000Z"),
        updatedAt: new Date("2026-04-12T12:00:00.000Z"),
        pausedAt: new Date("2026-04-12T12:00:00.000Z"),
      },
      {
        id: "conv-b",
        sequenceNumber: 2,
        title: "Conversation (2)",
        status: "paused",
        sessionKey: "session-b",
        selectedLanguages: ["en", "ko"],
        speechLanguages: ["en"],
        translationLanguagesLinked: true,
        createdAt: new Date("2026-04-12T08:00:00.000Z"),
        updatedAt: new Date("2026-04-12T10:00:00.000Z"),
        pausedAt: new Date("2026-04-12T10:00:00.000Z"),
      },
    ]);
    mockAppMessageFindMany.mockResolvedValue([
      {
        sessionKey: "session-a",
        createdAt: new Date("2026-04-12T09:30:00.000Z"),
        sourceLanguage: "en",
        metadata: null,
        contents: [{ language: "en", text: "older message" }],
      },
      {
        sessionKey: "session-b",
        createdAt: new Date("2026-04-12T11:30:00.000Z"),
        sourceLanguage: "en",
        metadata: null,
        contents: [{ language: "en", text: "newest message" }],
      },
    ]);
    mockAppMessageGroupBy.mockResolvedValue([
      {
        sessionKey: "session-a",
        _count: { _all: 37 },
      },
      {
        sessionKey: "session-b",
        _count: { _all: 648 },
      },
    ]);

    const conversations = await listConversationChannelsForUser("user-1");

    expect(conversations.map((conversation) => conversation.id)).toEqual(["conv-b", "conv-a"]);
    expect(conversations[0]).toEqual(expect.objectContaining({
      latestMessagePreview: "newest message",
      latestMessageAt: "2026-04-12T11:30:00.000Z",
      messageCount: 648,
    }));
    expect(conversations[1]).toEqual(expect.objectContaining({
      messageCount: 37,
    }));
    expect(mockAppMessageGroupBy).toHaveBeenCalledWith({
      by: ["sessionKey"],
      where: {
        sessionKey: {
          in: ["session-a", "session-b"],
        },
        OR: [
          { isDeleted: false },
          { isDeleted: null },
        ],
      },
      _count: {
        _all: true,
      },
    });
  });

  it("hydrates only the latest visible message batch in chronological order", async () => {
    mockFindConversationFirst.mockResolvedValue({
      id: "conv-a",
      sequenceNumber: 1,
      title: "Conversation (1)",
      status: "paused",
      sessionKey: "session-a",
      selectedLanguages: ["en", "ko"],
      speechLanguages: ["en"],
      translationLanguagesLinked: true,
      createdAt: new Date("2026-04-12T08:00:00.000Z"),
      updatedAt: new Date("2026-04-12T12:00:00.000Z"),
      pausedAt: new Date("2026-04-12T12:00:00.000Z"),
    });
    mockAppEventLogFindFirst.mockResolvedValue({ usageSec: 42 });
    mockAppMessageCount.mockResolvedValue(250);
    mockAppMessageFindMany.mockResolvedValue([
      {
        id: "msg-new",
        clientMessageId: "u-new",
        sourceLanguage: "en",
        createdAt: new Date("2026-04-12T10:00:00.000Z"),
        contents: [
          { contentType: "SOURCE", language: "en", text: "new source" },
          { contentType: "TRANSLATION_FINAL", language: "ko", text: "새 번역" },
        ],
      },
      {
        id: "msg-old",
        clientMessageId: "u-old",
        sourceLanguage: "en",
        createdAt: new Date("2026-04-12T09:00:00.000Z"),
        contents: [
          { contentType: "SOURCE", language: "en", text: "old source" },
          { contentType: "TRANSLATION_FINAL", language: "ko", text: "이전 번역" },
        ],
      },
    ]);

    const state = await getConversationHydrationStateForUser({
      conversationId: "conv-a",
      userId: "user-1",
    });

    expect(mockAppEventLogFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        sessionKey: "session-a",
        usageSec: { not: null },
      },
      orderBy: { createdAt: "desc" },
    }));
    expect(mockAppMessageFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        sessionKey: "session-a",
        OR: [
          { isDeleted: false },
          { isDeleted: null },
        ],
      },
      orderBy: [
        { createdAt: "desc" },
        { id: "desc" },
      ],
      take: CONVERSATION_HYDRATION_MESSAGE_LIMIT + 1,
      select: expect.objectContaining({
        contents: expect.objectContaining({
          where: {
            OR: [
              { isDeleted: false },
              { isDeleted: null },
            ],
          },
        }),
      }),
    }));
    expect(mockAppMessageCount).toHaveBeenCalledWith({
      where: {
        sessionKey: "session-a",
        OR: [
          { isDeleted: false },
          { isDeleted: null },
        ],
      },
    });
    expect(state?.usageSec).toBe(42);
    expect(state?.messageCount).toBe(250);
    expect(state?.utterances.map((utterance) => utterance.id)).toEqual(["u-old", "u-new"]);
    expect(state?.utterances[0]?.translations).toEqual({ ko: "이전 번역" });
    expect(state?.hasMoreUtterances).toBe(false);
    expect(state?.oldestMessageCursor).toEqual({
      createdAtMs: new Date("2026-04-12T09:00:00.000Z").getTime(),
      messageId: "msg-old",
    });
  });

  it("applies the before cursor when hydrating older server messages", async () => {
    mockFindConversationFirst.mockResolvedValue({
      id: "conv-a",
      sequenceNumber: 1,
      title: "Conversation (1)",
      status: "paused",
      sessionKey: "session-a",
      selectedLanguages: ["en", "ko"],
      speechLanguages: ["en"],
      translationLanguagesLinked: true,
      createdAt: new Date("2026-04-12T08:00:00.000Z"),
      updatedAt: new Date("2026-04-12T12:00:00.000Z"),
      pausedAt: new Date("2026-04-12T12:00:00.000Z"),
    });
    mockAppEventLogFindFirst.mockResolvedValue(null);
    mockAppMessageCount.mockResolvedValue(101);
    mockAppMessageFindMany.mockResolvedValue(
      Array.from({ length: CONVERSATION_HYDRATION_MESSAGE_LIMIT + 1 }, (_, index) => ({
        id: `msg-${String(index).padStart(3, "0")}`,
        clientMessageId: `u-${index}`,
        sourceLanguage: "en",
        createdAt: new Date(1_712_916_000_000 - index),
        contents: [
          { contentType: "SOURCE", language: "en", text: `source ${index}` },
        ],
      })),
    );

    const beforeCreatedAtMs = new Date("2026-04-12T09:00:00.000Z").getTime();
    const state = await getConversationHydrationStateForUser({
      conversationId: "conv-a",
      userId: "user-1",
      before: {
        createdAtMs: beforeCreatedAtMs,
        messageId: "msg-cursor",
      },
    });

    expect(mockAppMessageFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        sessionKey: "session-a",
        AND: [
          {
            OR: [
              { createdAt: { lt: new Date(beforeCreatedAtMs) } },
              {
                createdAt: new Date(beforeCreatedAtMs),
                id: { lt: "msg-cursor" },
              },
            ],
          },
        ],
      }),
      take: CONVERSATION_HYDRATION_MESSAGE_LIMIT + 1,
    }));
    expect(state?.messageCount).toBe(101);
    expect(state?.hasMoreUtterances).toBe(true);
    expect(state?.utterances).toHaveLength(CONVERSATION_HYDRATION_MESSAGE_LIMIT);
    expect(state?.oldestMessageCursor).toEqual({
      createdAtMs: new Date(1_712_916_000_000 - (CONVERSATION_HYDRATION_MESSAGE_LIMIT - 1)).getTime(),
      messageId: "msg-099",
    });
  });

  it("marks deleted conversations as paused and soft-deleted", async () => {
    mockFindConversationFirst.mockResolvedValue({ id: "conv-delete" });
    mockUpdateConversation.mockResolvedValue({
      id: "conv-delete",
      sequenceNumber: 1,
      title: "Conversation (1)",
      status: "paused",
      sessionKey: "session-delete",
      selectedLanguages: ["en", "ko"],
      speechLanguages: ["en"],
      translationLanguagesLinked: true,
      createdAt: new Date("2026-04-12T08:00:00.000Z"),
      updatedAt: new Date("2026-04-12T12:00:00.000Z"),
      pausedAt: new Date("2026-04-12T12:00:00.000Z"),
    });

    await deleteConversationChannel({
      conversationId: "conv-delete",
      userId: "user-1",
    });

    expect(mockFindConversationFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: "conv-delete",
        ownerUserId: "user-1",
        OR: [
          { isDeleted: false },
          { isDeleted: null },
        ],
      },
    }));
    expect(mockUpdateConversation).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        isDeleted: true,
        status: "paused",
      }),
    }));
  });
});

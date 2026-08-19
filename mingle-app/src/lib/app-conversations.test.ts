import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockFindConversationMany,
  mockFindConversationFirst,
  mockUpdateConversation,
  mockUpdateManyConversation,
  mockCreateConversation,
  mockAppMessageFindMany,
  mockAppMessageCount,
  mockAppMessageGroupBy,
  mockAppEventLogFindFirst,
  mockChannelMemberFindMany,
  mockChannelMemberCreateMany,
  mockChannelMemberUpdate,
  mockFindConversationUniqueOrThrow,
  mockUserFindUnique,
} = vi.hoisted(() => ({
  mockFindConversationMany: vi.fn(),
  mockFindConversationFirst: vi.fn(),
  mockUpdateConversation: vi.fn(),
  mockUpdateManyConversation: vi.fn(),
  mockCreateConversation: vi.fn(),
  mockAppMessageFindMany: vi.fn(),
  mockAppMessageCount: vi.fn(),
  mockAppMessageGroupBy: vi.fn(),
  mockAppEventLogFindFirst: vi.fn(),
  mockChannelMemberFindMany: vi.fn(),
  mockChannelMemberCreateMany: vi.fn(),
  mockChannelMemberUpdate: vi.fn(),
  mockFindConversationUniqueOrThrow: vi.fn(),
  mockUserFindUnique: vi.fn(),
}));

vi.mock("@/lib/prisma", () => {
  const prisma = {
    appConversationChannel: {
      findMany: mockFindConversationMany,
      findFirst: mockFindConversationFirst,
      findUniqueOrThrow: mockFindConversationUniqueOrThrow,
      update: mockUpdateConversation,
      updateMany: mockUpdateManyConversation,
      create: mockCreateConversation,
    },
    appConversationChannelMember: {
      findMany: mockChannelMemberFindMany,
      createMany: mockChannelMemberCreateMany,
      update: mockChannelMemberUpdate,
    },
    user: {
      findUnique: mockUserFindUnique,
    },
    appMessage: {
      findMany: mockAppMessageFindMany,
      count: mockAppMessageCount,
      groupBy: mockAppMessageGroupBy,
    },
    appEventLog: {
      findFirst: mockAppEventLogFindFirst,
    },
    $transaction: vi.fn(async (arg: unknown) => {
      if (typeof arg === "function") {
        return (arg as (tx: typeof prisma) => Promise<unknown>)(prisma);
      }
      return Promise.all(arg as Promise<unknown>[]);
    }),
  };
  return { prisma };
});

vi.mock("@/lib/stt-languages", () => ({
  sanitizeSttLanguageSelection: (value: unknown) => Array.isArray(value) ? value : [],
}));

vi.mock("@/i18n/conversations", () => ({
  formatLocalizedConversationTitle: (sequenceNumber: number, locale: string) => `${locale}:${sequenceNumber}`,
}));

import {
  CONVERSATION_HYDRATION_MESSAGE_LIMIT,
  createConversationChannelForUser,
  deleteConversationChannel,
  findOrCreateDirectConversation,
  getConversationHydrationStateForUser,
  getConversationSessionKeyForMember,
  listConversationChannelsForExternalUserId,
  listConversationChannelsForUser,
  updateConversationChannelDefaultDisplayLanguage,
  updateConversationChannelStatus,
  updateConversationChannelTitle,
} from "@/lib/app-conversations";

describe("app-conversations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAppMessageGroupBy.mockResolvedValue([]);
    mockUpdateManyConversation.mockResolvedValue({ count: 0 });
    mockChannelMemberFindMany.mockResolvedValue([]);
    mockChannelMemberCreateMany.mockResolvedValue({ count: 0 });
    mockUserFindUnique.mockResolvedValue(null);
  });

  it("treats isDeleted = null as visible when listing conversations", async () => {
    mockFindConversationMany.mockResolvedValue([]);
    mockAppMessageFindMany.mockResolvedValue([]);

    await listConversationChannelsForUser("user-1");

    expect(mockFindConversationMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        members: { some: { userId: "user-1" } },
        OR: [
          { isDeleted: false },
          { isDeleted: null },
        ],
      },
    }));
  });

  it("cannot list, read, or update a channel the user isn't a member of", async () => {
    mockFindConversationMany.mockResolvedValue([]);
    mockFindConversationFirst.mockResolvedValue(null);

    const listed = await listConversationChannelsForUser("stranger");
    expect(listed).toEqual([]);

    const hydrated = await getConversationHydrationStateForUser({
      conversationId: "conv-a",
      userId: "stranger",
    });
    expect(hydrated).toBeNull();

    const updated = await updateConversationChannelTitle({
      conversationId: "conv-a",
      userId: "stranger",
      title: "New title",
    });
    expect(updated).toBeNull();
    expect(mockFindConversationFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: "conv-a",
        members: { some: { userId: "stranger" } },
      }),
    }));
  });

  it("resolves a 2-person room's title to the other member's name, per viewer", async () => {
    mockFindConversationFirst.mockResolvedValue({
      id: "conv-dm",
      sequenceNumber: 1,
      title: "Conversation (1)",
      status: "active",
      sessionKey: "session-dm",
      selectedLanguages: ["en"],
      speechLanguages: ["en"],
      translationLanguagesLinked: true,
      createdAt: new Date("2026-04-12T08:00:00.000Z"),
      updatedAt: new Date("2026-04-12T08:00:00.000Z"),
      pausedAt: null,
    });
    mockAppEventLogFindFirst.mockResolvedValue(null);
    mockAppMessageCount.mockResolvedValue(0);
    mockAppMessageFindMany.mockResolvedValue([]);
    mockChannelMemberFindMany.mockResolvedValue([
      { channelId: "conv-dm", userId: "user-1", user: { name: "Alice", handle: "alice" } },
      { channelId: "conv-dm", userId: "user-2", user: { name: "Bob", handle: "bob" } },
    ]);

    const state = await getConversationHydrationStateForUser({
      conversationId: "conv-dm",
      userId: "user-1",
    });

    expect(state?.conversation.title).toBe("Bob");
  });

  it("pauses every other room the caller is a member of, not just ones they own", async () => {
    mockFindConversationFirst.mockResolvedValue({ id: "conv-a" });
    mockUpdateConversation.mockResolvedValue({
      id: "conv-a",
      sequenceNumber: 1,
      title: "Conversation (1)",
      status: "active",
      sessionKey: "session-a",
      selectedLanguages: ["en"],
      speechLanguages: ["en"],
      translationLanguagesLinked: true,
      createdAt: new Date("2026-04-12T08:00:00.000Z"),
      updatedAt: new Date("2026-04-12T08:00:00.000Z"),
      pausedAt: null,
    });

    await updateConversationChannelStatus({
      conversationId: "conv-a",
      userId: "user-1",
      status: "active",
    });

    expect(mockUpdateManyConversation).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        members: { some: { userId: "user-1" } },
        id: { not: "conv-a" },
        status: "active",
      }),
    }));
  });

  it("writes a multi-member room's display language to the caller's own membership row", async () => {
    mockFindConversationFirst.mockResolvedValue({ id: "conv-dm", selectedLanguages: ["en", "ko"] });
    mockChannelMemberFindMany.mockResolvedValue([
      { channelId: "conv-dm", userId: "user-1", displayLanguage: null, user: { name: "Alice", handle: "alice" } },
      { channelId: "conv-dm", userId: "user-2", displayLanguage: null, user: { name: "Bob", handle: "bob" } },
    ]);
    mockFindConversationUniqueOrThrow.mockResolvedValue({
      id: "conv-dm",
      sequenceNumber: 1,
      title: "Conversation (1)",
      status: "active",
      sessionKey: "session-dm",
      selectedLanguages: ["en", "ko"],
      speechLanguages: ["en"],
      translationLanguagesLinked: true,
      defaultDisplayLanguage: null,
      createdAt: new Date("2026-04-12T08:00:00.000Z"),
      updatedAt: new Date("2026-04-12T08:00:00.000Z"),
      pausedAt: null,
    });

    await updateConversationChannelDefaultDisplayLanguage({
      conversationId: "conv-dm",
      userId: "user-1",
      defaultDisplayLanguage: "ko",
    });

    expect(mockChannelMemberUpdate).toHaveBeenCalledWith({
      where: { channelId_userId: { channelId: "conv-dm", userId: "user-1" } },
      data: { displayLanguage: "ko" },
    });
    expect(mockUpdateConversation).not.toHaveBeenCalled();
  });

  it("keeps writing the channel-wide display language for solo (1-member) rooms", async () => {
    mockFindConversationFirst.mockResolvedValue({ id: "conv-solo", selectedLanguages: ["en", "ko"] });
    mockChannelMemberFindMany.mockResolvedValue([
      { channelId: "conv-solo", userId: "user-1", displayLanguage: null, user: { name: "Alice", handle: "alice" } },
    ]);
    mockUpdateConversation.mockResolvedValue({
      id: "conv-solo",
      sequenceNumber: 1,
      title: "Conversation (1)",
      status: "active",
      sessionKey: "session-solo",
      selectedLanguages: ["en", "ko"],
      speechLanguages: ["en"],
      translationLanguagesLinked: true,
      defaultDisplayLanguage: "ko",
      createdAt: new Date("2026-04-12T08:00:00.000Z"),
      updatedAt: new Date("2026-04-12T08:00:00.000Z"),
      pausedAt: null,
    });

    await updateConversationChannelDefaultDisplayLanguage({
      conversationId: "conv-solo",
      userId: "user-1",
      defaultDisplayLanguage: "ko",
    });

    expect(mockUpdateConversation).toHaveBeenCalledWith(expect.objectContaining({
      data: { defaultDisplayLanguage: "ko" },
    }));
    expect(mockChannelMemberUpdate).not.toHaveBeenCalled();
  });

  it("resolves the internal viewer id and per-viewer title on the external-identity list path", async () => {
    mockUserFindUnique.mockResolvedValue({ id: "user-1" });
    mockFindConversationMany.mockResolvedValue([
      {
        id: "conv-dm",
        sequenceNumber: 1,
        title: "Conversation (1)",
        status: "active",
        sessionKey: "session-dm",
        selectedLanguages: ["en"],
        speechLanguages: ["en"],
        translationLanguagesLinked: true,
        createdAt: new Date("2026-04-12T08:00:00.000Z"),
        updatedAt: new Date("2026-04-12T08:00:00.000Z"),
        pausedAt: null,
      },
    ]);
    mockAppMessageFindMany.mockResolvedValue([]);
    mockChannelMemberFindMany.mockResolvedValue([
      { channelId: "conv-dm", userId: "user-1", displayLanguage: null, user: { name: "Alice", handle: "alice" } },
      { channelId: "conv-dm", userId: "user-2", displayLanguage: null, user: { name: "Bob", handle: "bob" } },
    ]);

    const conversations = await listConversationChannelsForExternalUserId("anon_local_storage_user");

    expect(mockUserFindUnique).toHaveBeenCalledWith({
      where: { externalUserId: "anon_local_storage_user" },
      select: { id: true },
    });
    expect(conversations[0]?.title).toBe("Bob");
  });

  it("can list conversations directly by the stable external user identity", async () => {
    mockFindConversationMany.mockResolvedValue([]);
    mockAppMessageFindMany.mockResolvedValue([]);

    await listConversationChannelsForExternalUserId(" anon_local_storage_user ");

    expect(mockFindConversationMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        members: {
          some: { user: { is: { externalUserId: "anon_local_storage_user" } } },
        },
        OR: [
          { isDeleted: false },
          { isDeleted: null },
        ],
      },
    }));
  });

  it("can list conversation shells without scanning message tables", async () => {
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
    ]);

    const conversations = await listConversationChannelsForUser("user-1", {
      includeMessageSummaries: false,
    });

    expect(conversations).toEqual([
      expect.objectContaining({
        id: "conv-a",
        latestMessagePreview: undefined,
        latestMessageAt: null,
      }),
    ]);
    expect(conversations[0]).not.toHaveProperty("messageCount");
    expect(mockAppMessageFindMany).not.toHaveBeenCalled();
    expect(mockAppMessageGroupBy).not.toHaveBeenCalled();
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
        metadata: { speaker: "1", speakerAvatarSeed: "seed-a", speakerAvatarIndex: 4 },
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
        metadata: true,
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
    expect(state?.utterances[0]?.speaker).toBeNull();
    expect(state?.utterances[1]?.speaker).toBe("1");
    expect(state?.utterances[1]?.speakerAvatarSeed).toBe("seed-a");
    expect(state?.utterances[1]?.speakerAvatarIndex).toBe(4);
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
        sequenceNumber: -1,
      }),
    }));
  });

  it("vacates the sequence number below the lowest existing one so it never collides with a future room", async () => {
    mockFindConversationFirst
      .mockResolvedValueOnce({ id: "conv-delete" })
      .mockResolvedValueOnce({ sequenceNumber: -4 });
    mockUpdateConversation.mockResolvedValue({
      id: "conv-delete",
      sequenceNumber: -5,
      title: "Conversation (1)",
      status: "paused",
      sessionKey: "session-delete",
      selectedLanguages: ["en"],
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

    expect(mockUpdateConversation).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ sequenceNumber: -5 }),
    }));
  });

  it("ignores soft-deleted conversations when assigning the next sequence number", async () => {
    mockFindConversationFirst.mockResolvedValue(null);
    mockCreateConversation.mockResolvedValue({
      id: "conv-new",
      sequenceNumber: 1,
      title: "ko:1",
      status: "paused",
      sessionKey: "session-new",
      selectedLanguages: ["en"],
      speechLanguages: ["en"],
      translationLanguagesLinked: true,
      createdAt: new Date("2026-04-12T08:00:00.000Z"),
      updatedAt: new Date("2026-04-12T08:00:00.000Z"),
      pausedAt: new Date("2026-04-12T08:00:00.000Z"),
    });
    mockAppMessageFindMany.mockResolvedValue([]);

    await createConversationChannelForUser("user-1", { locale: "ko" });

    expect(mockFindConversationFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        ownerUserId: "user-1",
        OR: [
          { isDeleted: false },
          { isDeleted: null },
        ],
      },
    }));
    expect(mockCreateConversation).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ sequenceNumber: 1 }),
    }));
    expect(mockChannelMemberCreateMany).toHaveBeenCalledWith({
      data: [{ channelId: "conv-new", userId: "user-1", role: "owner" }],
      skipDuplicates: true,
    });
  });

  it("adds invitees as members alongside the creator when starting a room with other people", async () => {
    mockFindConversationFirst.mockResolvedValue(null);
    mockCreateConversation.mockResolvedValue({
      id: "conv-new",
      sequenceNumber: 1,
      title: "ko:1",
      status: "paused",
      sessionKey: "session-new",
      selectedLanguages: ["en"],
      speechLanguages: ["en"],
      translationLanguagesLinked: true,
      createdAt: new Date("2026-04-12T08:00:00.000Z"),
      updatedAt: new Date("2026-04-12T08:00:00.000Z"),
      pausedAt: new Date("2026-04-12T08:00:00.000Z"),
    });
    mockAppMessageFindMany.mockResolvedValue([]);

    await createConversationChannelForUser("user-1", {
      locale: "ko",
      inviteeUserIds: ["user-2", "user-3", "user-1"],
    });

    expect(mockChannelMemberCreateMany).toHaveBeenCalledWith({
      data: [
        { channelId: "conv-new", userId: "user-1", role: "owner" },
        { channelId: "conv-new", userId: "user-2", role: "member" },
        { channelId: "conv-new", userId: "user-3", role: "member" },
      ],
      skipDuplicates: true,
    });
  });

  it("vacates a stale soft-deleted row that still occupies the next sequence number", async () => {
    mockFindConversationFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ sequenceNumber: 1 });
    mockCreateConversation.mockResolvedValue({
      id: "conv-new",
      sequenceNumber: 1,
      title: "ko:1",
      status: "paused",
      sessionKey: "session-new",
      selectedLanguages: ["en"],
      speechLanguages: ["en"],
      translationLanguagesLinked: true,
      createdAt: new Date("2026-04-12T08:00:00.000Z"),
      updatedAt: new Date("2026-04-12T08:00:00.000Z"),
      pausedAt: new Date("2026-04-12T08:00:00.000Z"),
    });
    mockAppMessageFindMany.mockResolvedValue([]);

    await createConversationChannelForUser("user-1", { locale: "ko" });

    expect(mockUpdateManyConversation).toHaveBeenCalledWith({
      where: { ownerUserId: "user-1", sequenceNumber: 1, isDeleted: true },
      data: { sequenceNumber: 0 },
    });
    expect(mockCreateConversation).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ sequenceNumber: 1 }),
    }));
  });

  describe("getConversationSessionKeyForMember", () => {
    it("returns the sessionKey for a real member", async () => {
      mockFindConversationFirst.mockResolvedValue({ sessionKey: "session-a" });

      const sessionKey = await getConversationSessionKeyForMember({
        conversationId: "conv-a",
        userId: "user-1",
      });

      expect(sessionKey).toBe("session-a");
      expect(mockFindConversationFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          id: "conv-a",
          members: { some: { userId: "user-1" } },
        }),
        select: { sessionKey: true },
      }));
    });

    it("returns null for a non-member", async () => {
      mockFindConversationFirst.mockResolvedValue(null);

      const sessionKey = await getConversationSessionKeyForMember({
        conversationId: "conv-a",
        userId: "stranger",
      });

      expect(sessionKey).toBeNull();
    });
  });

  describe("findOrCreateDirectConversation", () => {
    it("reuses an existing 1:1 room instead of creating a duplicate", async () => {
      mockUserFindUnique.mockResolvedValue({ id: "user-2" });
      mockFindConversationFirst.mockResolvedValue({
        id: "conv-existing",
        sequenceNumber: 1,
        title: "Conversation (1)",
        status: "paused",
        sessionKey: "session-existing",
        selectedLanguages: ["en"],
        speechLanguages: ["en"],
        translationLanguagesLinked: true,
        createdAt: new Date("2026-04-12T08:00:00.000Z"),
        updatedAt: new Date("2026-04-12T08:00:00.000Z"),
        pausedAt: new Date("2026-04-12T08:00:00.000Z"),
      });

      const conversation = await findOrCreateDirectConversation({
        userId: "user-1",
        targetUserId: "user-2",
      });

      expect(conversation.id).toBe("conv-existing");
      expect(mockFindConversationFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          members: { some: { userId: "user-1" } },
          AND: [
            { members: { some: { userId: "user-2" } } },
            { members: { none: { userId: { notIn: ["user-1", "user-2"] } } } },
          ],
        }),
      }));
      expect(mockCreateConversation).not.toHaveBeenCalled();
    });

    it("creates a new 1:1 room when none exists yet", async () => {
      mockUserFindUnique.mockResolvedValue({ id: "user-2" });
      mockFindConversationFirst
        .mockResolvedValueOnce(null) // no existing 1:1 room
        .mockResolvedValueOnce(null); // sequenceNumber lookup inside createConversationChannelForUser
      mockCreateConversation.mockResolvedValue({
        id: "conv-new-dm",
        sequenceNumber: 1,
        title: "en:1",
        status: "paused",
        sessionKey: "session-new-dm",
        selectedLanguages: ["en"],
        speechLanguages: ["en"],
        translationLanguagesLinked: true,
        createdAt: new Date("2026-04-12T08:00:00.000Z"),
        updatedAt: new Date("2026-04-12T08:00:00.000Z"),
        pausedAt: new Date("2026-04-12T08:00:00.000Z"),
      });
      mockAppMessageFindMany.mockResolvedValue([]);

      await findOrCreateDirectConversation({ userId: "user-1", targetUserId: "user-2" });

      expect(mockChannelMemberCreateMany).toHaveBeenCalledWith({
        data: [
          { channelId: "conv-new-dm", userId: "user-1", role: "owner" },
          { channelId: "conv-new-dm", userId: "user-2", role: "member" },
        ],
        skipDuplicates: true,
      });
    });

    it("rejects a target user that doesn't exist", async () => {
      mockUserFindUnique.mockResolvedValue(null);

      await expect(findOrCreateDirectConversation({
        userId: "user-1",
        targetUserId: "ghost",
      })).rejects.toThrow("target_user_not_found");
    });

    it("rejects messaging yourself", async () => {
      await expect(findOrCreateDirectConversation({
        userId: "user-1",
        targetUserId: "user-1",
      })).rejects.toThrow("invalid_target_user");
      expect(mockUserFindUnique).not.toHaveBeenCalled();
    });
  });
});

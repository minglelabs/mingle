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
  mockQueryRaw,
  mockAppEventLogFindFirst,
  mockChannelMemberFindMany,
  mockChannelMemberCreateMany,
  mockChannelMemberUpdate,
  mockChannelMemberUpdateMany,
  mockChannelMemberCount,
  mockFindConversationUniqueOrThrow,
  mockFindConversationUnique,
  mockUserFindUnique,
  mockUserFindMany,
  mockUserBlockFindFirst,
  mockUserBlockFindMany,
} = vi.hoisted(() => ({
  mockFindConversationMany: vi.fn(),
  mockFindConversationFirst: vi.fn(),
  mockUpdateConversation: vi.fn(),
  mockUpdateManyConversation: vi.fn(),
  mockCreateConversation: vi.fn(),
  mockAppMessageFindMany: vi.fn(),
  mockAppMessageCount: vi.fn(),
  mockAppMessageGroupBy: vi.fn(),
  mockQueryRaw: vi.fn(),
  mockAppEventLogFindFirst: vi.fn(),
  mockChannelMemberFindMany: vi.fn(),
  mockChannelMemberCreateMany: vi.fn(),
  mockChannelMemberUpdate: vi.fn(),
  mockChannelMemberUpdateMany: vi.fn(),
  mockChannelMemberCount: vi.fn(),
  mockFindConversationUniqueOrThrow: vi.fn(),
  mockFindConversationUnique: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockUserFindMany: vi.fn(),
  mockUserBlockFindFirst: vi.fn(),
  mockUserBlockFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => {
  const prisma = {
    appConversationChannel: {
      findMany: mockFindConversationMany,
      findFirst: mockFindConversationFirst,
      findUnique: mockFindConversationUnique,
      findUniqueOrThrow: mockFindConversationUniqueOrThrow,
      update: mockUpdateConversation,
      updateMany: mockUpdateManyConversation,
      create: mockCreateConversation,
    },
    appConversationChannelMember: {
      findMany: mockChannelMemberFindMany,
      createMany: mockChannelMemberCreateMany,
      update: mockChannelMemberUpdate,
      updateMany: mockChannelMemberUpdateMany,
      count: mockChannelMemberCount,
    },
    user: {
      findUnique: mockUserFindUnique,
      findMany: mockUserFindMany,
    },
    userBlock: {
      findFirst: mockUserBlockFindFirst,
      findMany: mockUserBlockFindMany,
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
    $queryRaw: mockQueryRaw,
  };
  return { prisma };
});

vi.mock("@/lib/stt-languages", () => ({
  sanitizeSttLanguageSelection: (value: unknown) => Array.isArray(value) ? value : [],
  deriveDefaultSttLanguagesForLocale: (locale: string) => [locale || "en"],
}));

vi.mock("@/i18n/conversations", () => ({
  formatLocalizedConversationTitle: (sequenceNumber: number, locale: string) => `${locale}:${sequenceNumber}`,
}));

import {
  CONVERSATION_HYDRATION_MESSAGE_LIMIT,
  createConversationChannelForUser,
  deleteConversationChannel,
  findExistingConversationWithExactMembers,
  findOrCreateDirectConversation,
  getConversationHydrationStateForUser,
  getConversationSessionKeyForMember,
  isMessageSenderBlockedInConversation,
  leaveConversationChannel,
  listChannelMemberUserIdsBySessionKey,
  listConversationChannelsForExternalUserId,
  listConversationMembersForUser,
  listConversationChannelsForUser,
  markConversationChannelRead,
  materializePendingConversationInvitees,
  updateConversationChannelDefaultDisplayLanguage,
  updateConversationChannelSelectedLanguages,
  updateConversationChannelStatus,
  updateConversationChannelTitle,
} from "@/lib/app-conversations";

describe("app-conversations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAppMessageFindMany.mockResolvedValue([]);
    mockAppMessageGroupBy.mockResolvedValue([]);
    mockQueryRaw.mockResolvedValue([]);
    mockUpdateManyConversation.mockResolvedValue({ count: 0 });
    mockChannelMemberFindMany.mockResolvedValue([]);
    mockChannelMemberCreateMany.mockResolvedValue({ count: 0 });
    mockChannelMemberUpdateMany.mockResolvedValue({ count: 0 });
    mockUserFindUnique.mockResolvedValue(null);
    mockUserFindMany.mockResolvedValue([]);
    mockUserBlockFindFirst.mockResolvedValue(null);
    mockUserBlockFindMany.mockResolvedValue([]);
  });

  it("treats isDeleted = null as visible when listing conversations", async () => {
    mockFindConversationMany.mockResolvedValue([]);
    mockAppMessageFindMany.mockResolvedValue([]);

    await listConversationChannelsForUser("user-1");

    expect(mockFindConversationMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        members: { some: { userId: "user-1", leftAt: null } },
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
        members: { some: { userId: "stranger", leftAt: null } },
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
      pendingInviteeUserIds: [],
      createdAt: new Date("2026-04-12T08:00:00.000Z"),
      updatedAt: new Date("2026-04-12T08:00:00.000Z"),
      pausedAt: null,
    });
    mockAppEventLogFindFirst.mockResolvedValue(null);
    mockAppMessageCount.mockResolvedValue(0);
    mockAppMessageFindMany.mockResolvedValue([]);
    mockChannelMemberFindMany.mockResolvedValue([
      { channelId: "conv-dm", userId: "user-1", selectedLanguages: [], user: { name: "Alice", handle: "alice" } },
      { channelId: "conv-dm", userId: "user-2", selectedLanguages: [], user: { name: "Bob", handle: "bob" } },
    ]);

    const state = await getConversationHydrationStateForUser({
      conversationId: "conv-dm",
      userId: "user-1",
    });

    expect(state?.conversation.title).toBe("Bob");
  });

  it("treats a room with a pending (not-yet-materialized) invitee as multi-member, before they ever send a message", async () => {
    // Regression: a fresh "message this person" room has only the owner as a
    // real member until the invitee's first-message materialization (see
    // pendingInviteeUserIds). Without effective-member-count awareness, the
    // title, isMultiMember flag, and language union/attribution would all
    // incorrectly behave like a solo room for that whole window, flipping to
    // correct only once the invitee is materialized or the viewer reopens
    // the room — reported as a live bug (bubble alignment + title flicker).
    mockFindConversationFirst.mockResolvedValue({
      id: "conv-pending-dm",
      sequenceNumber: 1,
      title: "Conversation (1)",
      status: "paused",
      sessionKey: "session-pending-dm",
      selectedLanguages: ["ko", "en"],
      speechLanguages: ["ko", "en"],
      translationLanguagesLinked: true,
      pendingInviteeUserIds: ["user-2"],
      createdAt: new Date("2026-04-12T08:00:00.000Z"),
      updatedAt: new Date("2026-04-12T08:00:00.000Z"),
      pausedAt: new Date("2026-04-12T08:00:00.000Z"),
    });
    mockAppEventLogFindFirst.mockResolvedValue(null);
    mockAppMessageCount.mockResolvedValue(0);
    mockAppMessageFindMany.mockResolvedValue([]);
    // Only the owner has a real membership row — the invitee is still pending.
    mockChannelMemberFindMany.mockResolvedValue([
      { channelId: "conv-pending-dm", userId: "user-1", selectedLanguages: ["ko", "en"], user: { name: "Alice", handle: "alice" } },
    ]);
    mockUserFindMany.mockResolvedValue([
      { id: "user-2", name: "Bob", handle: "bob", defaultConversationLanguages: ["ja"] },
    ]);

    const state = await getConversationHydrationStateForUser({
      conversationId: "conv-pending-dm",
      userId: "user-1",
    });

    expect(mockUserFindMany).toHaveBeenCalledWith({
      where: { id: { in: ["user-2"] } },
      select: {
        id: true,
        name: true,
        handle: true,
        image: true,
        imageCropScale: true,
        imageCropX: true,
        imageCropY: true,
        defaultConversationLanguages: true,
      },
    });
    expect(state?.conversation.title).toBe("Bob");
    expect(state?.conversation.isMultiMember).toBe(true);
    expect(state?.conversation.selectedLanguages).toEqual(["ko", "en", "ja"]);
    expect(state?.conversation.selectedLanguagesAttribution).toEqual({
      ko: ["user-1"],
      en: ["user-1"],
      ja: ["user-2"],
    });
  });

  it("resolves a 3+ person room's title to a comma-joined list of every other member's name", async () => {
    mockFindConversationFirst.mockResolvedValue({
      id: "conv-group",
      sequenceNumber: 1,
      title: "Conversation (1)",
      status: "active",
      sessionKey: "session-group",
      selectedLanguages: ["en"],
      speechLanguages: ["en"],
      translationLanguagesLinked: true,
      pendingInviteeUserIds: [],
      createdAt: new Date("2026-04-12T08:00:00.000Z"),
      updatedAt: new Date("2026-04-12T08:00:00.000Z"),
      pausedAt: null,
    });
    mockAppEventLogFindFirst.mockResolvedValue(null);
    mockAppMessageCount.mockResolvedValue(0);
    mockAppMessageFindMany.mockResolvedValue([]);
    mockChannelMemberFindMany.mockResolvedValue([
      { channelId: "conv-group", userId: "user-1", selectedLanguages: [], user: { name: "Alice", handle: "alice" } },
      { channelId: "conv-group", userId: "user-2", selectedLanguages: [], user: { name: "Bob", handle: "bob" } },
      { channelId: "conv-group", userId: "user-3", selectedLanguages: [], user: { name: "Carol", handle: "carol" } },
    ]);

    const state = await getConversationHydrationStateForUser({
      conversationId: "conv-group",
      userId: "user-1",
    });

    expect(state?.conversation.title).toBe("Bob, Carol");
  });

  it("falls back to the stored title once the only other member of a 2-person room has left", async () => {
    mockFindConversationFirst.mockResolvedValue({
      id: "conv-dm",
      sequenceNumber: 1,
      title: "Conversation (1)",
      status: "active",
      sessionKey: "session-dm",
      selectedLanguages: ["en"],
      speechLanguages: ["en"],
      translationLanguagesLinked: true,
      pendingInviteeUserIds: [],
      createdAt: new Date("2026-04-12T08:00:00.000Z"),
      updatedAt: new Date("2026-04-12T08:00:00.000Z"),
      pausedAt: null,
      userEditedTitleAt: null,
    });
    mockAppEventLogFindFirst.mockResolvedValue(null);
    mockAppMessageCount.mockResolvedValue(0);
    mockAppMessageFindMany.mockResolvedValue([]);
    mockChannelMemberFindMany.mockResolvedValue([
      { channelId: "conv-dm", userId: "user-1", selectedLanguages: [], user: { name: "Alice", handle: "alice" } },
      {
        channelId: "conv-dm",
        userId: "user-2",
        selectedLanguages: [],
        leftAt: new Date("2026-04-13T00:00:00.000Z"),
        user: { name: "Bob", handle: "bob" },
      },
    ]);

    const state = await getConversationHydrationStateForUser({
      conversationId: "conv-dm",
      userId: "user-1",
    });

    // isMultiMember stays sticky (real bubble rendering mode for the room's
    // history), but the title has nobody active left to name.
    expect(state?.conversation.isMultiMember).toBe(true);
    expect(state?.conversation.title).toBe("Conversation (1)");
  });

  it("drops a departed member from a 3+ person room's title immediately", async () => {
    mockFindConversationFirst.mockResolvedValue({
      id: "conv-group",
      sequenceNumber: 1,
      title: "Conversation (1)",
      status: "active",
      sessionKey: "session-group",
      selectedLanguages: ["en"],
      speechLanguages: ["en"],
      translationLanguagesLinked: true,
      pendingInviteeUserIds: [],
      createdAt: new Date("2026-04-12T08:00:00.000Z"),
      updatedAt: new Date("2026-04-12T08:00:00.000Z"),
      pausedAt: null,
      userEditedTitleAt: null,
    });
    mockAppEventLogFindFirst.mockResolvedValue(null);
    mockAppMessageCount.mockResolvedValue(0);
    mockAppMessageFindMany.mockResolvedValue([]);
    mockChannelMemberFindMany.mockResolvedValue([
      { channelId: "conv-group", userId: "user-1", selectedLanguages: [], user: { name: "Alice", handle: "alice" } },
      {
        channelId: "conv-group",
        userId: "user-2",
        selectedLanguages: [],
        leftAt: new Date("2026-04-13T00:00:00.000Z"),
        user: { name: "Bob", handle: "bob" },
      },
      { channelId: "conv-group", userId: "user-3", selectedLanguages: [], user: { name: "Carol", handle: "carol" } },
    ]);

    const state = await getConversationHydrationStateForUser({
      conversationId: "conv-group",
      userId: "user-1",
    });

    expect(state?.conversation.title).toBe("Carol");
    expect(state?.conversation.otherMembers.map((member) => member.userId)).toEqual(["user-3"]);
  });

  it("keeps a manually renamed room's title even after its named member leaves", async () => {
    mockFindConversationFirst.mockResolvedValue({
      id: "conv-dm",
      sequenceNumber: 1,
      title: "Team Lunch",
      status: "active",
      sessionKey: "session-dm",
      selectedLanguages: ["en"],
      speechLanguages: ["en"],
      translationLanguagesLinked: true,
      pendingInviteeUserIds: [],
      createdAt: new Date("2026-04-12T08:00:00.000Z"),
      updatedAt: new Date("2026-04-12T08:00:00.000Z"),
      pausedAt: null,
      userEditedTitleAt: new Date("2026-04-12T09:00:00.000Z"),
    });
    mockAppEventLogFindFirst.mockResolvedValue(null);
    mockAppMessageCount.mockResolvedValue(0);
    mockAppMessageFindMany.mockResolvedValue([]);
    mockChannelMemberFindMany.mockResolvedValue([
      { channelId: "conv-dm", userId: "user-1", selectedLanguages: [], user: { name: "Alice", handle: "alice" } },
      { channelId: "conv-dm", userId: "user-2", selectedLanguages: [], user: { name: "Bob", handle: "bob" } },
    ]);

    const state = await getConversationHydrationStateForUser({
      conversationId: "conv-dm",
      userId: "user-1",
    });

    expect(state?.conversation.title).toBe("Team Lunch");
  });

  it("pauses every other SOLO room the caller is a member of, not just ones they own", async () => {
    mockFindConversationFirst.mockResolvedValue({ id: "conv-a" });
    // 1st findMany call: conv-a's own members (target is solo).
    // 2nd findMany call (inside the transaction): the caller's OTHER rooms.
    mockChannelMemberFindMany
      .mockResolvedValueOnce([{ channelId: "conv-a", userId: "user-1", user: {} }])
      .mockResolvedValueOnce([
        { channelId: "conv-b", status: "active", channel: { status: "active", _count: { members: 1 } } },
      ]);
    mockUpdateConversation.mockResolvedValue({
      id: "conv-a",
      sequenceNumber: 1,
      title: "Conversation (1)",
      status: "active",
      sessionKey: "session-a",
      selectedLanguages: ["en"],
      speechLanguages: ["en"],
      translationLanguagesLinked: true,
      pendingInviteeUserIds: [],
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
      where: { id: { in: ["conv-b"] } },
      data: expect.objectContaining({ status: "paused" }),
    }));
    expect(mockChannelMemberUpdateMany).not.toHaveBeenCalled();
  });

  it("pauses only the caller's own membership in another SHARED room, leaving other members untouched", async () => {
    mockFindConversationFirst.mockResolvedValue({ id: "conv-a" });
    mockChannelMemberFindMany
      .mockResolvedValueOnce([{ channelId: "conv-a", userId: "user-1", user: {} }])
      .mockResolvedValueOnce([
        {
          channelId: "conv-shared",
          status: "active",
          channel: { status: "active", _count: { members: 2 } },
        },
      ]);
    mockUpdateConversation.mockResolvedValue({
      id: "conv-a",
      sequenceNumber: 1,
      title: "Conversation (1)",
      status: "active",
      sessionKey: "session-a",
      selectedLanguages: ["en"],
      speechLanguages: ["en"],
      translationLanguagesLinked: true,
      pendingInviteeUserIds: [],
      createdAt: new Date("2026-04-12T08:00:00.000Z"),
      updatedAt: new Date("2026-04-12T08:00:00.000Z"),
      pausedAt: null,
    });

    await updateConversationChannelStatus({
      conversationId: "conv-a",
      userId: "user-1",
      status: "active",
    });

    expect(mockChannelMemberUpdateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", channelId: { in: ["conv-shared"] } },
      data: expect.objectContaining({ status: "paused" }),
    });
    expect(mockUpdateManyConversation).not.toHaveBeenCalled();
  });

  it("treats another room with a pending invitee as shared when enforcing one active room", async () => {
    mockFindConversationFirst.mockResolvedValue({
      id: "conv-a",
      pendingInviteeUserIds: [],
    });
    mockChannelMemberFindMany
      .mockResolvedValueOnce([{ channelId: "conv-a", userId: "user-1", user: {} }])
      .mockResolvedValueOnce([
        {
          channelId: "conv-pending",
          status: "active",
          channel: {
            status: "active",
            pendingInviteeUserIds: ["user-2"],
            _count: { members: 1 },
          },
        },
      ]);
    mockUpdateConversation.mockResolvedValue({
      id: "conv-a",
      sequenceNumber: 1,
      title: "Conversation (1)",
      status: "active",
      sessionKey: "session-a",
      selectedLanguages: ["en"],
      speechLanguages: ["en"],
      translationLanguagesLinked: true,
      pendingInviteeUserIds: [],
      createdAt: new Date("2026-04-12T08:00:00.000Z"),
      updatedAt: new Date("2026-04-12T08:00:00.000Z"),
      pausedAt: null,
    });
    mockAppMessageFindMany.mockResolvedValue([]);

    await updateConversationChannelStatus({
      conversationId: "conv-a",
      userId: "user-1",
      status: "active",
    });

    expect(mockChannelMemberUpdateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", channelId: { in: ["conv-pending"] } },
      data: expect.objectContaining({ status: "paused" }),
    });
    expect(mockUpdateManyConversation).not.toHaveBeenCalled();
  });

  it("writes a shared room's own status/pausedAt to the caller's membership row, not the channel", async () => {
    mockFindConversationFirst.mockResolvedValue({ id: "conv-dm" });
    mockChannelMemberFindMany.mockResolvedValueOnce([
      { channelId: "conv-dm", userId: "user-1", user: {} },
      { channelId: "conv-dm", userId: "user-2", user: {} },
    ]);
    mockFindConversationUniqueOrThrow.mockResolvedValue({
      id: "conv-dm",
      sequenceNumber: 1,
      title: "Conversation (1)",
      status: "active",
      sessionKey: "session-dm",
      selectedLanguages: ["en"],
      speechLanguages: ["en"],
      translationLanguagesLinked: true,
      pendingInviteeUserIds: [],
      createdAt: new Date("2026-04-12T08:00:00.000Z"),
      updatedAt: new Date("2026-04-12T08:00:00.000Z"),
      pausedAt: null,
    });

    await updateConversationChannelStatus({
      conversationId: "conv-dm",
      userId: "user-1",
      status: "paused",
    });

    expect(mockChannelMemberUpdate).toHaveBeenCalledWith({
      where: { channelId_userId: { channelId: "conv-dm", userId: "user-1" } },
      data: expect.objectContaining({ status: "paused" }),
    });
    expect(mockUpdateConversation).not.toHaveBeenCalled();
  });

  it("treats a room with pending invitees as shared when updating the owner's status", async () => {
    mockFindConversationFirst.mockResolvedValue({
      id: "conv-pending",
      pendingInviteeUserIds: ["user-2"],
    });
    mockChannelMemberFindMany.mockResolvedValue([
      {
        channelId: "conv-pending",
        userId: "user-1",
        status: "active",
        selectedLanguages: ["en"],
        user: {},
      },
    ]);
    mockFindConversationUniqueOrThrow.mockResolvedValue({
      id: "conv-pending",
      sequenceNumber: 1,
      title: "Conversation (1)",
      status: "active",
      sessionKey: "session-pending",
      selectedLanguages: ["en"],
      speechLanguages: ["en"],
      translationLanguagesLinked: true,
      pendingInviteeUserIds: ["user-2"],
      createdAt: new Date("2026-04-12T08:00:00.000Z"),
      updatedAt: new Date("2026-04-12T08:00:00.000Z"),
      pausedAt: null,
    });
    mockAppMessageFindMany.mockResolvedValue([]);

    await updateConversationChannelStatus({
      conversationId: "conv-pending",
      userId: "user-1",
      status: "paused",
    });

    expect(mockChannelMemberUpdate).toHaveBeenCalledWith({
      where: { channelId_userId: { channelId: "conv-pending", userId: "user-1" } },
      data: expect.objectContaining({ status: "paused" }),
    });
    expect(mockUpdateConversation).not.toHaveBeenCalled();
  });

  it("writes a multi-member room's display language to the caller's own membership row", async () => {
    mockFindConversationFirst.mockResolvedValue({ id: "conv-dm", selectedLanguages: ["en", "ko"] });
    mockChannelMemberFindMany.mockResolvedValue([
      { channelId: "conv-dm", userId: "user-1", displayLanguage: null, selectedLanguages: ["en", "ko"], user: { name: "Alice", handle: "alice" } },
      { channelId: "conv-dm", userId: "user-2", displayLanguage: null, selectedLanguages: [], user: { name: "Bob", handle: "bob" } },
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
      pendingInviteeUserIds: [],
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

  it("accepts a shared-room display language supplied by another member's selection", async () => {
    mockFindConversationFirst.mockResolvedValue({
      id: "conv-dm",
      selectedLanguages: ["en"],
      pendingInviteeUserIds: [],
    });
    mockChannelMemberFindMany.mockResolvedValue([
      {
        channelId: "conv-dm",
        userId: "user-1",
        displayLanguage: null,
        selectedLanguages: ["en"],
        user: { name: "Alice", handle: "alice" },
      },
      {
        channelId: "conv-dm",
        userId: "user-2",
        displayLanguage: null,
        selectedLanguages: ["ko"],
        user: { name: "Bob", handle: "bob" },
      },
    ]);
    mockFindConversationUniqueOrThrow.mockResolvedValue({
      id: "conv-dm",
      sequenceNumber: 1,
      title: "Conversation (1)",
      status: "active",
      sessionKey: "session-dm",
      selectedLanguages: ["en"],
      speechLanguages: ["en"],
      translationLanguagesLinked: true,
      pendingInviteeUserIds: [],
      defaultDisplayLanguage: null,
      createdAt: new Date("2026-04-12T08:00:00.000Z"),
      updatedAt: new Date("2026-04-12T08:00:00.000Z"),
      pausedAt: null,
    });
    mockAppMessageFindMany.mockResolvedValue([]);

    await updateConversationChannelDefaultDisplayLanguage({
      conversationId: "conv-dm",
      userId: "user-1",
      defaultDisplayLanguage: "ko",
    });

    expect(mockChannelMemberUpdate).toHaveBeenCalledWith({
      where: { channelId_userId: { channelId: "conv-dm", userId: "user-1" } },
      data: { displayLanguage: "ko" },
    });
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
      pendingInviteeUserIds: [],
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

  it("writes a multi-member room's selected languages to the caller's own membership row, showing the union with attribution to other viewers", async () => {
    mockFindConversationFirst.mockResolvedValue({ id: "conv-dm" });
    mockChannelMemberFindMany
      // 1st call inside updateConversationChannelSelectedLanguages: decide multi-member.
      .mockResolvedValueOnce([
        { channelId: "conv-dm", userId: "user-1", selectedLanguages: ["en"], user: {} },
        { channelId: "conv-dm", userId: "user-2", selectedLanguages: ["ja"], user: {} },
      ])
      // 2nd call inside serializeConversationChannelWithPreview: resolve the union for the response.
      .mockResolvedValueOnce([
        { channelId: "conv-dm", userId: "user-1", selectedLanguages: ["ko", "en"], user: {} },
        { channelId: "conv-dm", userId: "user-2", selectedLanguages: ["ja"], user: {} },
      ]);
    mockUpdateConversation.mockResolvedValue({
      id: "conv-dm",
      sequenceNumber: 1,
      title: "Conversation (1)",
      status: "active",
      sessionKey: "session-dm",
      selectedLanguages: ["en"],
      speechLanguages: ["en"],
      translationLanguagesLinked: true,
      pendingInviteeUserIds: [],
      createdAt: new Date("2026-04-12T08:00:00.000Z"),
      updatedAt: new Date("2026-04-12T08:00:00.000Z"),
      pausedAt: null,
    });

    const result = await updateConversationChannelSelectedLanguages({
      conversationId: "conv-dm",
      userId: "user-1",
      selectedLanguages: ["ko", "en"],
    });

    expect(mockChannelMemberUpdate).toHaveBeenCalledWith({
      where: { channelId_userId: { channelId: "conv-dm", userId: "user-1" } },
      data: { selectedLanguages: ["ko", "en"] },
    });
    expect(mockUpdateConversation).toHaveBeenCalledWith(expect.objectContaining({
      data: { translationLanguagesLinked: false },
    }));
    // Own list is ["ko", "en"], the other member still holds "ja" — a member
    // deselecting a language elsewhere shouldn't remove it from the room's
    // shared picker while another member still wants it.
    expect(result?.selectedLanguages).toEqual(["ko", "en", "ja"]);
    expect(result?.selectedLanguagesAttribution).toEqual({
      ko: ["user-1"],
      en: ["user-1"],
      ja: ["user-2"],
    });
    // The caller's own list stays their own picks, not the union — this is
    // what the picker's add/remove decision and the next PATCH must read.
    expect(result?.viewerSelectedLanguages).toEqual(["ko", "en"]);
  });

  it("uses a member's persisted default instead of a stale channel-wide value when their room row is empty", async () => {
    // Regression: the channel-wide field ("ja") predates this member ever
    // opening the language screen. An empty per-room row must use the member's
    // persisted default (PT here), never revive the stale channel value.
    mockFindConversationFirst.mockResolvedValue({ id: "conv-dm" });
    mockChannelMemberFindMany
      .mockResolvedValueOnce([
        { channelId: "conv-dm", userId: "user-1", selectedLanguages: ["en"], user: {} },
        { channelId: "conv-dm", userId: "user-2", selectedLanguages: [], user: { defaultConversationLanguages: ["pt"] } },
      ])
      .mockResolvedValueOnce([
        { channelId: "conv-dm", userId: "user-1", selectedLanguages: ["ko", "en"], user: {} },
        { channelId: "conv-dm", userId: "user-2", selectedLanguages: [], user: { defaultConversationLanguages: ["pt"] } },
      ]);
    mockUpdateConversation.mockResolvedValue({
      id: "conv-dm",
      sequenceNumber: 1,
      title: "Conversation (1)",
      status: "active",
      sessionKey: "session-dm",
      selectedLanguages: ["ja"],
      speechLanguages: ["ja"],
      translationLanguagesLinked: true,
      pendingInviteeUserIds: [],
      createdAt: new Date("2026-04-12T08:00:00.000Z"),
      updatedAt: new Date("2026-04-12T08:00:00.000Z"),
      pausedAt: null,
    });

    const result = await updateConversationChannelSelectedLanguages({
      conversationId: "conv-dm",
      userId: "user-1",
      selectedLanguages: ["ko", "en"],
    });

    expect(result?.selectedLanguages).toEqual(["ko", "en", "pt"]);
    expect(result?.selectedLanguagesAttribution).toEqual({
      ko: ["user-1"],
      en: ["user-1"],
      pt: ["user-2"],
    });
  });

  it("orders the union around each viewer's own picks first, not one shared room-wide order for everyone", async () => {
    // A Korean speaker (KO+EN) and a Japanese speaker (JA+EN) in the same
    // room: the Korean viewer should see "ko, en, ja" (their own picks
    // first), the Japanese viewer "ja, en, ko" — not the same join-order
    // sequence for both.
    const sharedMembers = [
      { channelId: "conv-dm", userId: "user-ko", selectedLanguages: ["ko", "en"], user: {} },
      { channelId: "conv-dm", userId: "user-ja", selectedLanguages: ["ja", "en"], user: {} },
    ];
    mockFindConversationFirst.mockResolvedValue({
      id: "conv-dm",
      sequenceNumber: 1,
      title: "Conversation (1)",
      status: "active",
      sessionKey: "session-dm",
      selectedLanguages: ["ko", "en"],
      speechLanguages: ["ko", "en"],
      translationLanguagesLinked: true,
      pendingInviteeUserIds: [],
      createdAt: new Date("2026-04-12T08:00:00.000Z"),
      updatedAt: new Date("2026-04-12T08:00:00.000Z"),
      pausedAt: null,
    });
    mockAppEventLogFindFirst.mockResolvedValue(null);
    mockAppMessageCount.mockResolvedValue(0);
    mockAppMessageFindMany.mockResolvedValue([]);
    mockChannelMemberFindMany.mockResolvedValueOnce(sharedMembers);

    const koState = await getConversationHydrationStateForUser({
      conversationId: "conv-dm",
      userId: "user-ko",
    });
    expect(koState?.conversation.selectedLanguages).toEqual(["ko", "en", "ja"]);

    mockChannelMemberFindMany.mockResolvedValueOnce(sharedMembers);
    const jaState = await getConversationHydrationStateForUser({
      conversationId: "conv-dm",
      userId: "user-ja",
    });
    expect(jaState?.conversation.selectedLanguages).toEqual(["ja", "en", "ko"]);
  });

  it("keeps writing the channel-wide selected languages for solo (1-member) rooms, with no attribution", async () => {
    mockFindConversationFirst.mockResolvedValue({ id: "conv-solo" });
    mockChannelMemberFindMany.mockResolvedValue([
      { channelId: "conv-solo", userId: "user-1", selectedLanguages: [], user: {} },
    ]);
    mockUpdateConversation.mockResolvedValue({
      id: "conv-solo",
      sequenceNumber: 1,
      title: "Conversation (1)",
      status: "active",
      sessionKey: "session-solo",
      selectedLanguages: ["ko", "en"],
      speechLanguages: ["en"],
      translationLanguagesLinked: false,
      pendingInviteeUserIds: [],
      createdAt: new Date("2026-04-12T08:00:00.000Z"),
      updatedAt: new Date("2026-04-12T08:00:00.000Z"),
      pausedAt: null,
    });

    const result = await updateConversationChannelSelectedLanguages({
      conversationId: "conv-solo",
      userId: "user-1",
      selectedLanguages: ["ko", "en"],
    });

    expect(mockUpdateConversation).toHaveBeenCalledWith({
      where: { id: "conv-solo" },
      data: { selectedLanguages: ["ko", "en"], translationLanguagesLinked: false },
      select: expect.anything(),
    });
    expect(mockChannelMemberUpdate).not.toHaveBeenCalled();
    expect(result?.selectedLanguages).toEqual(["ko", "en"]);
    expect(result?.selectedLanguagesAttribution).toEqual({});
    expect(result?.viewerSelectedLanguages).toEqual(["ko", "en"]);
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
        pendingInviteeUserIds: [],
        createdAt: new Date("2026-04-12T08:00:00.000Z"),
        updatedAt: new Date("2026-04-12T08:00:00.000Z"),
        pausedAt: null,
      },
    ]);
    mockAppMessageFindMany.mockResolvedValue([]);
    mockChannelMemberFindMany.mockResolvedValue([
      { channelId: "conv-dm", userId: "user-1", displayLanguage: null, selectedLanguages: [], user: { name: "Alice", handle: "alice" } },
      { channelId: "conv-dm", userId: "user-2", displayLanguage: null, selectedLanguages: [], user: { name: "Bob", handle: "bob" } },
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
        pendingInviteeUserIds: [],
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
        pendingInviteeUserIds: [],
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
        pendingInviteeUserIds: [],
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

  it("includes the unread message count returned for each viewer membership", async () => {
    mockFindConversationMany.mockResolvedValue([{
      id: "conv-a",
      sequenceNumber: 1,
      title: "Conversation (1)",
      status: "active",
      sessionKey: "session-a",
      selectedLanguages: ["en", "ko"],
      speechLanguages: ["en"],
      translationLanguagesLinked: true,
      pendingInviteeUserIds: [],
      createdAt: new Date("2026-04-12T09:00:00.000Z"),
      updatedAt: new Date("2026-04-12T12:00:00.000Z"),
      pausedAt: null,
    }]);
    mockQueryRaw.mockResolvedValue([{ channelId: "conv-a", unreadCount: 3 }]);

    const conversations = await listConversationChannelsForUser("user-1");

    expect(conversations[0]).toEqual(expect.objectContaining({
      id: "conv-a",
      unreadMessageCount: 3,
    }));
    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
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
      pendingInviteeUserIds: [],
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

  it("populates speakerImage from membership only once the room has 2+ real members", async () => {
    mockFindConversationFirst.mockResolvedValue({
      id: "conv-group",
      sequenceNumber: 1,
      title: "Conversation (1)",
      status: "active",
      sessionKey: "session-group",
      selectedLanguages: ["en"],
      speechLanguages: ["en"],
      translationLanguagesLinked: true,
      pendingInviteeUserIds: [],
      createdAt: new Date("2026-04-12T08:00:00.000Z"),
      updatedAt: new Date("2026-04-12T08:00:00.000Z"),
      pausedAt: null,
    });
    mockAppEventLogFindFirst.mockResolvedValue(null);
    mockAppMessageCount.mockResolvedValue(0);
    mockAppMessageFindMany.mockResolvedValue([
      {
        id: "msg-1",
        clientMessageId: "u-1",
        sourceLanguage: "en",
        createdAt: new Date("2026-04-12T09:00:00.000Z"),
        userId: "user-2",
        contents: [{ contentType: "SOURCE", language: "en", text: "hi" }],
      },
    ]);
    mockChannelMemberFindMany.mockResolvedValue([
      { channelId: "conv-group", userId: "user-1", selectedLanguages: [], user: { name: "Alice", handle: "alice", image: null } },
      { channelId: "conv-group", userId: "user-2", selectedLanguages: [], user: { name: "Bob", handle: "bob", image: "https://cdn/bob.jpg" } },
    ]);

    const state = await getConversationHydrationStateForUser({
      conversationId: "conv-group",
      userId: "user-1",
    });

    expect(state?.utterances[0]?.speakerImage).toBe("https://cdn/bob.jpg");
    expect(state?.utterances[0]?.speakerUserId).toBe("user-2");
    expect(state?.utterances[0]?.speakerName).toBe("Bob");
    expect(state?.conversation.isMultiMember).toBe(true);
  });

  it("flags a 2-person room as blocked and hides the counterpart's photo, but keeps speakerUserId for bubble alignment", async () => {
    mockFindConversationFirst.mockResolvedValue({
      id: "conv-blocked",
      sequenceNumber: 1,
      title: "Conversation (1)",
      status: "active",
      sessionKey: "session-blocked",
      selectedLanguages: ["en"],
      speechLanguages: ["en"],
      translationLanguagesLinked: true,
      pendingInviteeUserIds: [],
      createdAt: new Date("2026-04-12T08:00:00.000Z"),
      updatedAt: new Date("2026-04-12T08:00:00.000Z"),
      pausedAt: null,
    });
    mockAppEventLogFindFirst.mockResolvedValue(null);
    mockAppMessageCount.mockResolvedValue(0);
    mockAppMessageFindMany.mockResolvedValue([
      {
        id: "msg-1",
        clientMessageId: "u-1",
        sourceLanguage: "en",
        createdAt: new Date("2026-04-12T09:00:00.000Z"),
        userId: "user-2",
        contents: [{ contentType: "SOURCE", language: "en", text: "hi" }],
      },
    ]);
    mockChannelMemberFindMany.mockResolvedValue([
      { channelId: "conv-blocked", userId: "user-1", selectedLanguages: [], user: { name: "Alice", handle: "alice", image: null } },
      { channelId: "conv-blocked", userId: "user-2", selectedLanguages: [], user: { name: "Bob", handle: "bob", image: "https://cdn/bob.jpg" } },
    ]);
    // Blocked in either direction should hide the room the same way — here
    // the OTHER member blocked the viewer, not the other way around.
    mockUserBlockFindMany.mockResolvedValue([{ blockerId: "user-2", blockedId: "user-1" }]);

    const state = await getConversationHydrationStateForUser({
      conversationId: "conv-blocked",
      userId: "user-1",
    });

    expect(state?.conversation.isBlockedCounterpart).toBe(true);
    expect(state?.utterances[0]?.speakerUserId).toBe("user-2");
    expect(state?.utterances[0]?.speakerImage).toBeNull();
  });

  it("nulls out speakerUserId/speakerImage for a solo room, even when the message has a real userId", async () => {
    mockFindConversationFirst.mockResolvedValue({
      id: "conv-solo",
      sequenceNumber: 1,
      title: "Conversation (1)",
      status: "active",
      sessionKey: "session-solo",
      selectedLanguages: ["en"],
      speechLanguages: ["en"],
      translationLanguagesLinked: true,
      pendingInviteeUserIds: [],
      createdAt: new Date("2026-04-12T08:00:00.000Z"),
      updatedAt: new Date("2026-04-12T08:00:00.000Z"),
      pausedAt: null,
    });
    mockAppEventLogFindFirst.mockResolvedValue(null);
    mockAppMessageCount.mockResolvedValue(0);
    mockAppMessageFindMany.mockResolvedValue([
      {
        id: "msg-1",
        clientMessageId: "u-1",
        sourceLanguage: "en",
        createdAt: new Date("2026-04-12T09:00:00.000Z"),
        userId: "user-1",
        contents: [{ contentType: "SOURCE", language: "en", text: "hi" }],
      },
    ]);
    mockChannelMemberFindMany.mockResolvedValue([
      { channelId: "conv-solo", userId: "user-1", user: { name: "Alice", handle: "alice", image: "https://cdn/alice.jpg" } },
    ]);

    const state = await getConversationHydrationStateForUser({
      conversationId: "conv-solo",
      userId: "user-1",
    });

    expect(state?.utterances[0]?.speakerUserId).toBeNull();
    expect(state?.utterances[0]?.speakerImage).toBeNull();
    expect(state?.conversation.isMultiMember).toBe(false);
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
      pendingInviteeUserIds: [],
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
      pendingInviteeUserIds: [],
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
        members: { some: { userId: "user-1", leftAt: null } },
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
      pendingInviteeUserIds: [],
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

  it("returns null from deleteConversationChannel once the owner has left their own shared room", async () => {
    // Once the owner leaves (see leaveConversationChannel below), their own
    // membership row's leftAt is no longer null, so the leftAt: null clause
    // added to deleteConversationChannel's existence check no longer
    // matches — nobody inherits delete-for-everyone.
    mockFindConversationFirst.mockResolvedValue(null);

    const result = await deleteConversationChannel({
      conversationId: "conv-group",
      userId: "user-1",
    });

    expect(result).toBeNull();
  });

  describe("leaveConversationChannel", () => {
    it("marks the caller's own membership row as left, without touching the channel, when other active members remain", async () => {
      mockFindConversationFirst.mockResolvedValueOnce({ id: "conv-group", ownerUserId: "user-1" });
      mockChannelMemberCount.mockResolvedValue(3);
      mockFindConversationUniqueOrThrow.mockResolvedValue({
        id: "conv-group",
        sequenceNumber: 2,
        title: "Conversation (2)",
        status: "active",
        sessionKey: "session-group",
        selectedLanguages: ["en"],
        speechLanguages: ["en"],
        translationLanguagesLinked: true,
        pendingInviteeUserIds: [],
        createdAt: new Date("2026-04-12T08:00:00.000Z"),
        updatedAt: new Date("2026-04-12T08:00:00.000Z"),
        pausedAt: null,
      });

      const result = await leaveConversationChannel({
        conversationId: "conv-group",
        userId: "user-2",
      });

      expect(result?.id).toBe("conv-group");
      expect(mockChannelMemberUpdate).toHaveBeenCalledWith({
        where: { channelId_userId: { channelId: "conv-group", userId: "user-2" } },
        data: { leftAt: expect.any(Date) },
      });
      expect(mockUpdateConversation).not.toHaveBeenCalled();
    });

    it("degenerates to a full delete when the last active member leaves", async () => {
      mockFindConversationFirst
        .mockResolvedValueOnce({ id: "conv-group", ownerUserId: "user-1" })
        .mockResolvedValueOnce({ sequenceNumber: 0 });
      mockChannelMemberCount.mockResolvedValue(1);
      mockUpdateConversation.mockResolvedValue({
        id: "conv-group",
        sequenceNumber: -1,
        title: "Conversation (2)",
        status: "paused",
        sessionKey: "session-group",
        selectedLanguages: ["en"],
        speechLanguages: ["en"],
        translationLanguagesLinked: true,
        pendingInviteeUserIds: [],
        createdAt: new Date("2026-04-12T08:00:00.000Z"),
        updatedAt: new Date("2026-04-12T08:00:00.000Z"),
        pausedAt: new Date("2026-04-12T12:00:00.000Z"),
      });

      const result = await leaveConversationChannel({
        conversationId: "conv-group",
        userId: "user-3",
      });

      expect(result?.status).toBe("paused");
      expect(mockUpdateConversation).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          isDeleted: true,
          status: "paused",
          sequenceNumber: -1,
        }),
      }));
    });

    it("frees the owner's own room-count slot when they leave a room others remain in", async () => {
      mockFindConversationFirst
        .mockResolvedValueOnce({ id: "conv-group", ownerUserId: "user-1" })
        .mockResolvedValueOnce({ sequenceNumber: 0 });
      mockChannelMemberCount.mockResolvedValue(3);
      mockFindConversationUniqueOrThrow.mockResolvedValue({
        id: "conv-group",
        sequenceNumber: -1,
        title: "Conversation (2)",
        status: "active",
        sessionKey: "session-group",
        selectedLanguages: ["en"],
        speechLanguages: ["en"],
        translationLanguagesLinked: true,
        pendingInviteeUserIds: [],
        createdAt: new Date("2026-04-12T08:00:00.000Z"),
        updatedAt: new Date("2026-04-12T08:00:00.000Z"),
        pausedAt: null,
      });

      const result = await leaveConversationChannel({
        conversationId: "conv-group",
        userId: "user-1",
      });

      expect(result?.sequenceNumber).toBe(-1);
      expect(mockUpdateConversation).toHaveBeenCalledWith(expect.objectContaining({
        data: { sequenceNumber: -1 },
      }));
      // The channel itself is never marked deleted for this case.
      expect(mockUpdateConversation).not.toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ isDeleted: true }),
      }));
    });

    it("returns null for a caller who isn't an active member of the room", async () => {
      mockFindConversationFirst.mockResolvedValue(null);

      const result = await leaveConversationChannel({
        conversationId: "conv-group",
        userId: "user-4",
      });

      expect(result).toBeNull();
      expect(mockChannelMemberUpdate).not.toHaveBeenCalled();
    });
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
      pendingInviteeUserIds: [],
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
      data: [{
        channelId: "conv-new",
        userId: "user-1",
        role: "owner",
        status: "paused",
        pausedAt: new Date("2026-04-12T08:00:00.000Z"),
        selectedLanguages: ["ko"],
      }],
      skipDuplicates: true,
    });
  });

  it("records invitees as pending rather than real members when starting a room with other people", async () => {
    // No membership row, no visibility, nothing persisted about the invitee
    // until the owner's first message — see pendingInviteeUserIds' doc
    // comment and materializePendingConversationInvitees.
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
      pendingInviteeUserIds: [],
      createdAt: new Date("2026-04-12T08:00:00.000Z"),
      updatedAt: new Date("2026-04-12T08:00:00.000Z"),
      pausedAt: new Date("2026-04-12T08:00:00.000Z"),
    });
    mockAppMessageFindMany.mockResolvedValue([]);

    await createConversationChannelForUser("user-1", {
      locale: "ko",
      inviteeUserIds: ["user-2", "user-3", "user-1"],
    });

    expect(mockCreateConversation).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ pendingInviteeUserIds: ["user-2", "user-3"] }),
    }));
    expect(mockChannelMemberCreateMany).toHaveBeenCalledWith({
      data: [
        {
          channelId: "conv-new",
          userId: "user-1",
          role: "owner",
          status: "paused",
          pausedAt: new Date("2026-04-12T08:00:00.000Z"),
          selectedLanguages: ["ko"],
        },
      ],
      skipDuplicates: true,
    });
  });

  it("initializes a shared room from each participant's persisted conversation defaults", async () => {
    mockFindConversationFirst.mockResolvedValue(null);
    mockUserFindMany.mockResolvedValue([
      { id: "user-1", defaultConversationLanguages: ["ja", "en"] },
      { id: "user-2", name: "Bob", handle: "bob", defaultConversationLanguages: ["ko"] },
    ]);
    mockCreateConversation.mockResolvedValue({
      id: "conv-defaults",
      sequenceNumber: 1,
      title: "en:1",
      status: "paused",
      sessionKey: "session-defaults",
      selectedLanguages: ["ja", "en"],
      speechLanguages: ["ja", "en"],
      translationLanguagesLinked: true,
      pendingInviteeUserIds: ["user-2"],
      createdAt: new Date("2026-04-12T08:00:00.000Z"),
      updatedAt: new Date("2026-04-12T08:00:00.000Z"),
      pausedAt: new Date("2026-04-12T08:00:00.000Z"),
    });
    mockChannelMemberFindMany.mockResolvedValue([
      {
        channelId: "conv-defaults",
        userId: "user-1",
        selectedLanguages: ["ja", "en"],
        user: { name: "Alice", handle: "alice" },
      },
    ]);

    const result = await createConversationChannelForUser("user-1", {
      inviteeUserIds: ["user-2"],
    });

    expect(mockCreateConversation).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        selectedLanguages: ["ja", "en"],
        speechLanguages: ["ja", "en"],
        pendingInviteeUserIds: ["user-2"],
      }),
    }));
    expect(mockChannelMemberCreateMany).toHaveBeenCalledWith({
      data: [{
        channelId: "conv-defaults",
        userId: "user-1",
        role: "owner",
        status: "paused",
        pausedAt: new Date("2026-04-12T08:00:00.000Z"),
        selectedLanguages: ["ja", "en"],
      }],
      skipDuplicates: true,
    });
    expect(result.selectedLanguages).toEqual(["ja", "en", "ko"]);
    expect(result.selectedLanguagesAttribution).toEqual({
      ja: ["user-1"],
      en: ["user-1"],
      ko: ["user-2"],
    });
    expect(result.viewerSelectedLanguages).toEqual(["ja", "en"]);
  });

  it("rejects starting a room with more than 10 total members", async () => {
    const inviteeUserIds = Array.from({ length: 10 }, (_, index) => `user-${index + 2}`);

    await expect(
      createConversationChannelForUser("user-1", { locale: "ko", inviteeUserIds }),
    ).rejects.toThrow("too_many_invitees");
    expect(mockCreateConversation).not.toHaveBeenCalled();
  });

  it("rejects inviting a user blocked in either direction", async () => {
    mockUserBlockFindFirst.mockResolvedValue({ blockerId: "user-2" });

    await expect(
      createConversationChannelForUser("user-1", { locale: "ko", inviteeUserIds: ["user-2"] }),
    ).rejects.toThrow("target_user_blocked");
    expect(mockCreateConversation).not.toHaveBeenCalled();
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
      pendingInviteeUserIds: [],
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
          members: { some: { userId: "user-1", leftAt: null } },
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

  describe("listConversationMembersForUser", () => {
    it("returns every member's profile for a real member", async () => {
      mockFindConversationFirst.mockResolvedValue({ id: "conv-a" });
      mockChannelMemberFindMany.mockResolvedValue([
        {
          channelId: "conv-a",
          userId: "user-1",
          displayLanguage: null,
          selectedLanguages: ["ko", "en"],
          status: "active",
          pausedAt: null,
          user: { name: "Alice", handle: "alice", image: null, imageCropScale: null, imageCropX: null, imageCropY: null },
        },
        {
          channelId: "conv-a",
          userId: "user-2",
          displayLanguage: null,
          selectedLanguages: ["ja"],
          status: "active",
          pausedAt: null,
          user: { name: "Bob", handle: "bob", image: "https://img/bob.jpg", imageCropScale: 1.2, imageCropX: 0.1, imageCropY: 0.2 },
        },
      ]);

      const members = await listConversationMembersForUser({
        conversationId: "conv-a",
        userId: "user-1",
      });

      expect(members).toEqual([
        { userId: "user-1", name: "Alice", handle: "alice", image: null, imageCropScale: null, imageCropX: null, imageCropY: null, selectedLanguages: ["ko", "en"], blocked: false, left: false },
        { userId: "user-2", name: "Bob", handle: "bob", image: "https://img/bob.jpg", imageCropScale: 1.2, imageCropX: 0.1, imageCropY: 0.2, selectedLanguages: ["ja"], blocked: false, left: false },
      ]);
      expect(mockFindConversationFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          id: "conv-a",
          members: { some: { userId: "user-1", leftAt: null } },
        }),
      }));
    });

    it("includes a pending invitee's default language and profile for attribution before materialization", async () => {
      mockFindConversationFirst.mockResolvedValue({
        id: "conv-a",
        pendingInviteeUserIds: ["user-2"],
      });
      mockChannelMemberFindMany.mockResolvedValue([
        {
          channelId: "conv-a",
          userId: "user-1",
          selectedLanguages: ["en"],
          user: { name: "Alice", handle: "alice", image: null, imageCropScale: null, imageCropX: null, imageCropY: null },
        },
      ]);
      mockUserFindMany.mockResolvedValue([
        {
          id: "user-2",
          name: "Bob",
          handle: "bob",
          image: "https://img/bob.jpg",
          imageCropScale: 1,
          imageCropX: 0,
          imageCropY: 0,
          defaultConversationLanguages: ["ja"],
        },
      ]);

      const members = await listConversationMembersForUser({
        conversationId: "conv-a",
        userId: "user-1",
      });

      expect(members).toEqual(expect.arrayContaining([
        expect.objectContaining({
          userId: "user-2",
          image: "https://img/bob.jpg",
          selectedLanguages: ["ja"],
          blocked: false,
        }),
      ]));
    });

    it("returns null for a non-member", async () => {
      mockFindConversationFirst.mockResolvedValue(null);

      const members = await listConversationMembersForUser({
        conversationId: "conv-a",
        userId: "stranger",
      });

      expect(members).toBeNull();
      expect(mockChannelMemberFindMany).not.toHaveBeenCalled();
    });

    it("hides the blocked counterpart's photo but keeps their name/handle, flagged via `blocked`", async () => {
      mockFindConversationFirst.mockResolvedValue({ id: "conv-a" });
      mockChannelMemberFindMany.mockResolvedValue([
        {
          channelId: "conv-a",
          userId: "user-1",
          displayLanguage: null,
          selectedLanguages: ["ko"],
          status: "active",
          pausedAt: null,
          user: { name: "Alice", handle: "alice", image: null, imageCropScale: null, imageCropX: null, imageCropY: null },
        },
        {
          channelId: "conv-a",
          userId: "user-2",
          displayLanguage: null,
          selectedLanguages: ["ja"],
          status: "active",
          pausedAt: null,
          user: { name: "Bob", handle: "bob", image: "https://img/bob.jpg", imageCropScale: null, imageCropX: null, imageCropY: null },
        },
      ]);
      mockUserBlockFindMany.mockResolvedValue([{ blockerId: "user-1", blockedId: "user-2" }]);

      const members = await listConversationMembersForUser({
        conversationId: "conv-a",
        userId: "user-1",
      });

      expect(members).toEqual([
        { userId: "user-1", name: "Alice", handle: "alice", image: null, imageCropScale: null, imageCropX: null, imageCropY: null, selectedLanguages: ["ko"], blocked: false, left: false },
        { userId: "user-2", name: "Bob", handle: "bob", image: null, imageCropScale: null, imageCropX: null, imageCropY: null, selectedLanguages: ["ja"], blocked: true, left: false },
      ]);
    });

    it("keeps a departed member's name/photo intact, unlike a blocked member's", async () => {
      mockFindConversationFirst.mockResolvedValue({ id: "conv-group" });
      mockChannelMemberFindMany.mockResolvedValue([
        {
          channelId: "conv-group",
          userId: "user-1",
          displayLanguage: null,
          selectedLanguages: ["ko"],
          status: "active",
          pausedAt: null,
          leftAt: null,
          user: { name: "Alice", handle: "alice", image: null, imageCropScale: null, imageCropX: null, imageCropY: null },
        },
        {
          channelId: "conv-group",
          userId: "user-2",
          displayLanguage: null,
          selectedLanguages: ["ja"],
          status: "active",
          pausedAt: null,
          leftAt: new Date("2026-04-12T09:00:00.000Z"),
          user: { name: "Bob", handle: "bob", image: "https://img/bob.jpg", imageCropScale: null, imageCropX: null, imageCropY: null },
        },
      ]);

      const members = await listConversationMembersForUser({
        conversationId: "conv-group",
        userId: "user-1",
      });

      expect(members).toEqual([
        { userId: "user-1", name: "Alice", handle: "alice", image: null, imageCropScale: null, imageCropX: null, imageCropY: null, selectedLanguages: ["ko"], blocked: false, left: false },
        { userId: "user-2", name: "Bob", handle: "bob", image: "https://img/bob.jpg", imageCropScale: null, imageCropX: null, imageCropY: null, selectedLanguages: ["ja"], blocked: false, left: true },
      ]);
    });
  });

  it("hides a blocked counterpart's photo in conversation list avatars", async () => {
    mockFindConversationMany.mockResolvedValue([{
      id: "conv-dm",
      sequenceNumber: 1,
      title: "Conversation (1)",
      status: "paused",
      sessionKey: "session-dm",
      selectedLanguages: ["en"],
      speechLanguages: ["en"],
      translationLanguagesLinked: true,
      pendingInviteeUserIds: [],
      createdAt: new Date("2026-04-12T08:00:00.000Z"),
      updatedAt: new Date("2026-04-12T08:00:00.000Z"),
      pausedAt: null,
    }]);
    mockChannelMemberFindMany.mockResolvedValue([
      {
        channelId: "conv-dm",
        userId: "user-1",
        displayLanguage: null,
        selectedLanguages: ["en"],
        status: "paused",
        pausedAt: null,
        user: {
          name: "Alice",
          handle: "alice",
          image: null,
          imageCropScale: null,
          imageCropX: null,
          imageCropY: null,
        },
      },
      {
        channelId: "conv-dm",
        userId: "user-2",
        displayLanguage: null,
        selectedLanguages: ["ko"],
        status: "paused",
        pausedAt: null,
        user: {
          name: "Bob",
          handle: "bob",
          image: "https://img/bob.jpg",
          imageCropScale: 1.2,
          imageCropX: 0.1,
          imageCropY: 0.2,
        },
      },
    ]);
    mockUserBlockFindMany.mockResolvedValue([{ blockerId: "user-1", blockedId: "user-2" }]);

    const conversations = await listConversationChannelsForUser("user-1");

    expect(conversations[0]).toEqual(expect.objectContaining({
      isBlockedCounterpart: true,
      otherMembers: [{
        userId: "user-2",
        name: "Bob",
        image: null,
        imageCropScale: null,
        imageCropX: null,
        imageCropY: null,
      }],
    }));
  });

  describe("findOrCreateDirectConversation", () => {
    it("reuses an existing 1:1 room instead of creating a duplicate", async () => {
      mockUserFindUnique.mockResolvedValue({ id: "user-2" });
      mockFindConversationMany.mockResolvedValue([{
        id: "conv-existing",
        sequenceNumber: 1,
        title: "Conversation (1)",
        status: "paused",
        sessionKey: "session-existing",
        selectedLanguages: ["en"],
        speechLanguages: ["en"],
        translationLanguagesLinked: true,
        pendingInviteeUserIds: [],
        createdAt: new Date("2026-04-12T08:00:00.000Z"),
        updatedAt: new Date("2026-04-12T08:00:00.000Z"),
        pausedAt: new Date("2026-04-12T08:00:00.000Z"),
      }]);

      const conversation = await findOrCreateDirectConversation({
        userId: "user-1",
        targetUserId: "user-2",
      });

      expect(conversation.conversation.id).toBe("conv-existing");
      expect(conversation.reused).toBe(true);
      expect(mockFindConversationMany).toHaveBeenCalledWith(expect.objectContaining({
        where: {
          members: { some: { userId: "user-1", leftAt: null } },
          AND: [
            {
              OR: [
                { isDeleted: false },
                { isDeleted: null },
              ],
            },
            {
              OR: [
                {
                  AND: [
                    { members: { some: { userId: "user-2", leftAt: null } } },
                    { members: { none: { userId: { notIn: ["user-1", "user-2"] }, leftAt: null } } },
                  ],
                },
                {
                  AND: [
                    { ownerUserId: "user-1" },
                    { pendingInviteeUserIds: { has: "user-2" } },
                    { members: { none: { userId: { not: "user-1" } } } },
                  ],
                },
              ],
            },
          ],
        },
      }));
      expect(mockCreateConversation).not.toHaveBeenCalled();
    });

    it("selects the 1:1 room with the latest app message", async () => {
      mockUserFindUnique.mockResolvedValue({ id: "user-2" });
      mockFindConversationMany.mockResolvedValue([
        {
          id: "conv-older",
          sequenceNumber: 1,
          title: "Conversation (1)",
          status: "paused",
          sessionKey: "session-older",
          selectedLanguages: ["en"],
          speechLanguages: ["en"],
          translationLanguagesLinked: true,
          pendingInviteeUserIds: [],
          createdAt: new Date("2026-04-12T08:00:00.000Z"),
          updatedAt: new Date("2026-06-12T08:00:00.000Z"),
          pausedAt: new Date("2026-04-12T08:00:00.000Z"),
        },
        {
          id: "conv-newer",
          sequenceNumber: 2,
          title: "Conversation (2)",
          status: "paused",
          sessionKey: "session-newer",
          selectedLanguages: ["en"],
          speechLanguages: ["en"],
          translationLanguagesLinked: true,
          pendingInviteeUserIds: [],
          createdAt: new Date("2026-05-12T08:00:00.000Z"),
          updatedAt: new Date("2026-05-12T08:00:00.000Z"),
          pausedAt: new Date("2026-05-12T08:00:00.000Z"),
        },
      ]);
      mockAppMessageFindMany.mockResolvedValueOnce([
        { sessionKey: "session-older", createdAt: new Date("2026-06-01T08:00:00.000Z") },
        { sessionKey: "session-newer", createdAt: new Date("2026-07-01T08:00:00.000Z") },
      ]);

      const result = await findOrCreateDirectConversation({
        userId: "user-1",
        targetUserId: "user-2",
      });

      expect(result.reused).toBe(true);
      expect(result.conversation.id).toBe("conv-newer");
      expect(mockAppMessageFindMany).toHaveBeenCalledWith(expect.objectContaining({
        orderBy: [
          { sessionKey: "asc" },
          { createdAt: "desc" },
        ],
        distinct: ["sessionKey"],
        select: { sessionKey: true, createdAt: true },
      }));
    });

    it("forces a new 1:1 room without checking existing rooms", async () => {
      mockUserFindUnique.mockResolvedValue({ id: "user-2" });
      mockFindConversationFirst.mockResolvedValueOnce(null);
      mockCreateConversation.mockResolvedValue({
        id: "conv-forced-dm",
        sequenceNumber: 2,
        title: "en:2",
        status: "paused",
        sessionKey: "session-forced-dm",
        selectedLanguages: ["en"],
        speechLanguages: ["en"],
        translationLanguagesLinked: true,
        pendingInviteeUserIds: [],
        createdAt: new Date("2026-07-12T08:00:00.000Z"),
        updatedAt: new Date("2026-07-12T08:00:00.000Z"),
        pausedAt: new Date("2026-07-12T08:00:00.000Z"),
      });

      const result = await findOrCreateDirectConversation({
        userId: "user-1",
        targetUserId: "user-2",
        force: true,
      });

      expect(result).toEqual(expect.objectContaining({
        reused: false,
        conversation: expect.objectContaining({ id: "conv-forced-dm" }),
      }));
      expect(mockFindConversationMany).not.toHaveBeenCalled();
    });

    it("creates a new 1:1 room when none exists yet", async () => {
      mockUserFindUnique.mockResolvedValue({ id: "user-2" });
      mockFindConversationMany.mockResolvedValueOnce([]); // no existing 1:1 room
      mockFindConversationFirst.mockResolvedValueOnce(null); // sequenceNumber lookup inside createConversationChannelForUser
      mockCreateConversation.mockResolvedValue({
        id: "conv-new-dm",
        sequenceNumber: 1,
        title: "en:1",
        status: "paused",
        sessionKey: "session-new-dm",
        selectedLanguages: ["en"],
        speechLanguages: ["en"],
        translationLanguagesLinked: true,
        pendingInviteeUserIds: [],
        createdAt: new Date("2026-04-12T08:00:00.000Z"),
        updatedAt: new Date("2026-04-12T08:00:00.000Z"),
        pausedAt: new Date("2026-04-12T08:00:00.000Z"),
      });
      mockAppMessageFindMany.mockResolvedValue([]);

      const result = await findOrCreateDirectConversation({ userId: "user-1", targetUserId: "user-2" });

      expect(result.reused).toBe(false);
      expect(mockCreateConversation).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ pendingInviteeUserIds: ["user-2"] }),
      }));
      expect(mockChannelMemberCreateMany).toHaveBeenCalledWith({
        data: [
          {
            channelId: "conv-new-dm",
            userId: "user-1",
            role: "owner",
            status: "paused",
            pausedAt: new Date("2026-04-12T08:00:00.000Z"),
            selectedLanguages: ["en"],
          },
        ],
        skipDuplicates: true,
      });
    });

    it("does not reuse a pending group room for a direct request", async () => {
      mockUserFindUnique.mockResolvedValue({ id: "user-2" });
      mockFindConversationMany.mockResolvedValueOnce([{
        id: "conv-pending-group",
        sequenceNumber: 1,
        title: "Conversation (1)",
        status: "paused",
        sessionKey: "session-pending-group",
        selectedLanguages: ["en"],
        speechLanguages: ["en"],
        translationLanguagesLinked: true,
        pendingInviteeUserIds: ["user-2", "user-3"],
        createdAt: new Date("2026-04-12T08:00:00.000Z"),
        updatedAt: new Date("2026-04-12T08:00:00.000Z"),
        pausedAt: null,
      }]);
      mockFindConversationFirst.mockResolvedValueOnce(null);
      mockCreateConversation.mockResolvedValue({
        id: "conv-new-dm",
        sequenceNumber: 2,
        title: "Conversation (2)",
        status: "paused",
        sessionKey: "session-new-dm",
        selectedLanguages: ["en"],
        speechLanguages: ["en"],
        translationLanguagesLinked: true,
        pendingInviteeUserIds: ["user-2"],
        createdAt: new Date("2026-04-12T09:00:00.000Z"),
        updatedAt: new Date("2026-04-12T09:00:00.000Z"),
        pausedAt: null,
      });

      const result = await findOrCreateDirectConversation({
        userId: "user-1",
        targetUserId: "user-2",
      });

      expect(result.reused).toBe(false);
      expect(result.conversation.id).toBe("conv-new-dm");
      expect(mockCreateConversation).toHaveBeenCalled();
    });

    it("rejects a target user that doesn't exist", async () => {
      mockUserFindUnique.mockResolvedValue(null);

      await expect(findOrCreateDirectConversation({
        userId: "user-1",
        targetUserId: "ghost",
      })).rejects.toThrow("target_user_not_found");
    });

    it("rejects starting a conversation with a user blocked in either direction", async () => {
      mockUserFindUnique.mockResolvedValue({ id: "user-2" });
      mockUserBlockFindFirst.mockResolvedValue({ blockerId: "user-2" });

      await expect(findOrCreateDirectConversation({
        userId: "user-1",
        targetUserId: "user-2",
      })).rejects.toThrow("target_user_blocked");

      expect(mockUserBlockFindFirst).toHaveBeenCalledWith({
        where: {
          OR: [
            { blockerId: "user-1", blockedId: "user-2" },
            { blockerId: "user-2", blockedId: "user-1" },
          ],
        },
        select: { blockerId: true },
      });
      expect(mockFindConversationFirst).not.toHaveBeenCalled();
      expect(mockCreateConversation).not.toHaveBeenCalled();
    });

    it("rejects messaging yourself", async () => {
      await expect(findOrCreateDirectConversation({
        userId: "user-1",
        targetUserId: "user-1",
      })).rejects.toThrow("invalid_target_user");
      expect(mockUserFindUnique).not.toHaveBeenCalled();
    });
  });

  describe("findExistingConversationWithExactMembers", () => {
    it("returns null immediately when there are no other user ids", async () => {
      const result = await findExistingConversationWithExactMembers({ userId: "user-1", otherUserIds: [] });

      expect(result).toBeNull();
      expect(mockFindConversationFirst).not.toHaveBeenCalled();
      expect(mockFindConversationMany).not.toHaveBeenCalled();
    });

    it("finds a room whose real members exactly match the requested set", async () => {
      mockFindConversationMany.mockResolvedValue([{
        id: "conv-group",
        sequenceNumber: 1,
        title: "Alice, Bob",
        status: "paused",
        sessionKey: "session-group",
        selectedLanguages: ["en"],
        speechLanguages: ["en"],
        translationLanguagesLinked: true,
        pendingInviteeUserIds: [],
        createdAt: new Date("2026-04-12T08:00:00.000Z"),
        updatedAt: new Date("2026-04-12T08:00:00.000Z"),
        pausedAt: new Date("2026-04-12T08:00:00.000Z"),
      }]);

      const result = await findExistingConversationWithExactMembers({
        userId: "user-1",
        otherUserIds: ["user-2", "user-3"],
      });

      expect(result?.id).toBe("conv-group");
      expect(mockFindConversationMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          members: { some: { userId: "user-1", leftAt: null } },
          AND: [
            { members: { some: { userId: "user-2", leftAt: null } } },
            { members: { some: { userId: "user-3", leftAt: null } } },
            { members: { none: { userId: { notIn: ["user-1", "user-2", "user-3"] }, leftAt: null } } },
          ],
        }),
      }));
      expect(mockFindConversationFirst).not.toHaveBeenCalled();
    });

    it("selects the group room with the latest app message", async () => {
      mockFindConversationMany.mockResolvedValue([{
        id: "conv-most-recent",
        sequenceNumber: 3,
        title: "Alice, Bob",
        status: "paused",
        sessionKey: "session-most-recent",
        selectedLanguages: ["en"],
        speechLanguages: ["en"],
        translationLanguagesLinked: true,
        pendingInviteeUserIds: [],
        createdAt: new Date("2026-06-01T08:00:00.000Z"),
        updatedAt: new Date("2026-06-01T08:00:00.000Z"),
        pausedAt: new Date("2026-06-01T08:00:00.000Z"),
      }, {
        id: "conv-updated-newer",
        sequenceNumber: 4,
        title: "Alice, Bob",
        status: "paused",
        sessionKey: "session-updated-newer",
        selectedLanguages: ["en"],
        speechLanguages: ["en"],
        translationLanguagesLinked: true,
        pendingInviteeUserIds: [],
        createdAt: new Date("2026-05-01T08:00:00.000Z"),
        updatedAt: new Date("2026-07-01T08:00:00.000Z"),
        pausedAt: new Date("2026-05-01T08:00:00.000Z"),
      }]);
      mockAppMessageFindMany.mockResolvedValueOnce([
        { sessionKey: "session-most-recent", createdAt: new Date("2026-06-01T08:00:00.000Z") },
        { sessionKey: "session-updated-newer", createdAt: new Date("2026-05-01T08:00:00.000Z") },
      ]);

      const result = await findExistingConversationWithExactMembers({
        userId: "user-1",
        otherUserIds: ["user-2", "user-3"],
      });

      expect(result?.id).toBe("conv-most-recent");
      expect(mockFindConversationFirst).not.toHaveBeenCalled();
    });

    it("falls back to a still-pending invite match when nobody's sent a first message yet", async () => {
      mockFindConversationMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
        {
          id: "conv-pending",
          sequenceNumber: 1,
          title: "Conversation (1)",
          status: "paused",
          sessionKey: "session-pending",
          selectedLanguages: ["en"],
          speechLanguages: ["en"],
          translationLanguagesLinked: true,
          pendingInviteeUserIds: ["user-3", "user-2"],
          createdAt: new Date("2026-04-12T08:00:00.000Z"),
          updatedAt: new Date("2026-04-12T08:00:00.000Z"),
          pausedAt: new Date("2026-04-12T08:00:00.000Z"),
        },
      ]);

      const result = await findExistingConversationWithExactMembers({
        userId: "user-1",
        otherUserIds: ["user-2", "user-3"],
      });

      expect(result?.id).toBe("conv-pending");
      expect(mockFindConversationMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          ownerUserId: "user-1",
          members: { none: { userId: { not: "user-1" } } },
          pendingInviteeUserIds: { hasEvery: ["user-2", "user-3"] },
        }),
      }));
    });

    it("ignores a pending-invite candidate whose set is a superset of what's requested", async () => {
      mockFindConversationMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
        {
          id: "conv-pending-superset",
          pendingInviteeUserIds: ["user-2", "user-3", "user-4"],
        },
        ]);

      const result = await findExistingConversationWithExactMembers({
        userId: "user-1",
        otherUserIds: ["user-2", "user-3"],
      });

      expect(result).toBeNull();
    });

    it("returns null when neither a materialized nor a pending match exists", async () => {
      mockFindConversationMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await findExistingConversationWithExactMembers({
        userId: "user-1",
        otherUserIds: ["user-2"],
      });

      expect(result).toBeNull();
    });
  });

  describe("markConversationChannelRead", () => {
    it("updates only a visible member's read cursor", async () => {
      mockChannelMemberUpdateMany.mockResolvedValue({ count: 1 });

      const marked = await markConversationChannelRead({
        conversationId: "conv-a",
        userId: "user-1",
      });

      expect(marked).toBe(true);
      expect(mockChannelMemberUpdateMany).toHaveBeenCalledWith({
        where: {
          channelId: "conv-a",
          userId: "user-1",
          channel: {
            OR: [
              { isDeleted: false },
              { isDeleted: null },
            ],
          },
        },
        data: { lastReadAt: expect.any(Date) },
      });
    });

    it("returns false when the membership does not exist", async () => {
      mockChannelMemberUpdateMany.mockResolvedValue({ count: 0 });

      await expect(markConversationChannelRead({
        conversationId: "missing",
        userId: "user-1",
      })).resolves.toBe(false);
    });
  });

  describe("materializePendingConversationInvitees", () => {
    it("turns pending invitees into real members and clears the pending list on the first message", async () => {
      mockFindConversationUnique.mockResolvedValue({
        id: "conv-dm",
        ownerUserId: "user-1",
        status: "active",
        pausedAt: null,
        pendingInviteeUserIds: ["user-2", "user-3"],
      });
      mockUserFindMany.mockResolvedValue([{ id: "user-2" }, { id: "user-3" }]);
      mockChannelMemberFindMany.mockResolvedValue([
        { userId: "user-1" },
        { userId: "user-2" },
        { userId: "user-3" },
      ]);

      const memberUserIds = await materializePendingConversationInvitees("session-dm");

      expect(mockFindConversationUnique).toHaveBeenCalledWith({
        where: { sessionKey: "session-dm" },
        select: {
          id: true,
          ownerUserId: true,
          status: true,
          pausedAt: true,
          pendingInviteeUserIds: true,
        },
      });
      expect(mockChannelMemberCreateMany).toHaveBeenCalledWith({
      data: [
          { channelId: "conv-dm", userId: "user-2", role: "member", status: "active", pausedAt: null, selectedLanguages: ["en"] },
          { channelId: "conv-dm", userId: "user-3", role: "member", status: "active", pausedAt: null, selectedLanguages: ["en"] },
        ],
        skipDuplicates: true,
      });
      expect(mockUpdateConversation).toHaveBeenCalledWith({
        where: { id: "conv-dm" },
        data: { pendingInviteeUserIds: [] },
      });
      expect(memberUserIds).toEqual(["user-1", "user-2", "user-3"]);
      expect(mockChannelMemberFindMany).toHaveBeenCalledWith({
        where: { channelId: "conv-dm" },
        select: { userId: true },
      });
    });

    it("does nothing for a room with no pending invitees", async () => {
      mockFindConversationUnique.mockResolvedValue({
        id: "conv-solo",
        ownerUserId: "user-1",
        status: "active",
        pausedAt: null,
        pendingInviteeUserIds: [],
      });

      await materializePendingConversationInvitees("session-solo");

      expect(mockChannelMemberCreateMany).not.toHaveBeenCalled();
      expect(mockUpdateConversation).not.toHaveBeenCalled();
    });

    it("does nothing when the sessionKey doesn't resolve to a channel", async () => {
      mockFindConversationUnique.mockResolvedValue(null);

      await materializePendingConversationInvitees("session-unknown");

      expect(mockChannelMemberCreateMany).not.toHaveBeenCalled();
      expect(mockUpdateConversation).not.toHaveBeenCalled();
    });

    it("drops an invitee blocked in either direction instead of failing the whole materialization", async () => {
      mockFindConversationUnique.mockResolvedValue({
        id: "conv-dm",
        ownerUserId: "user-1",
        status: "active",
        pausedAt: null,
        pendingInviteeUserIds: ["user-2", "user-3"],
      });
      mockUserFindMany.mockResolvedValue([{ id: "user-2" }, { id: "user-3" }]);
      mockUserBlockFindMany.mockResolvedValue([{ blockerId: "user-3", blockedId: "user-1" }]);

      await materializePendingConversationInvitees("session-dm");

      expect(mockChannelMemberCreateMany).toHaveBeenCalledWith({
      data: [
          { channelId: "conv-dm", userId: "user-2", role: "member", status: "active", pausedAt: null, selectedLanguages: ["en"] },
        ],
        skipDuplicates: true,
      });
      // The pending list is still cleared — a dropped, blocked invitee isn't
      // retried on the next message.
      expect(mockUpdateConversation).toHaveBeenCalledWith({
        where: { id: "conv-dm" },
        data: { pendingInviteeUserIds: [] },
      });
    });

    it("drops unknown pending ids before the membership foreign-key write", async () => {
      mockFindConversationUnique.mockResolvedValue({
        id: "conv-dm",
        ownerUserId: "user-1",
        status: "active",
        pausedAt: null,
        pendingInviteeUserIds: ["user-2", "ghost-user"],
      });
      mockUserFindMany.mockResolvedValue([{ id: "user-2" }]);

      await materializePendingConversationInvitees("session-dm");

      expect(mockChannelMemberCreateMany).toHaveBeenCalledWith({
      data: [
          { channelId: "conv-dm", userId: "user-2", role: "member", status: "active", pausedAt: null, selectedLanguages: ["en"] },
        ],
        skipDuplicates: true,
      });
      expect(mockUpdateConversation).toHaveBeenCalledWith({
        where: { id: "conv-dm" },
        data: { pendingInviteeUserIds: [] },
      });
    });
  });

  describe("listChannelMemberUserIdsBySessionKey", () => {
    it("returns every real member's userId for the channel behind sessionKey", async () => {
      mockFindConversationUnique.mockResolvedValue({
        members: [{ userId: "user-1" }, { userId: "user-2" }],
      });

      const memberUserIds = await listChannelMemberUserIdsBySessionKey("session-dm");

      expect(mockFindConversationUnique).toHaveBeenCalledWith({
        where: { sessionKey: "session-dm" },
        select: { members: { select: { userId: true } } },
      });
      expect(memberUserIds).toEqual(["user-1", "user-2"]);
    });

    it("returns an empty array when the sessionKey doesn't resolve to a channel", async () => {
      mockFindConversationUnique.mockResolvedValue(null);

      const memberUserIds = await listChannelMemberUserIdsBySessionKey("session-unknown");

      expect(memberUserIds).toEqual([]);
    });
  });

  describe("isMessageSenderBlockedInConversation", () => {
    it("returns true when either side has blocked the other in a 2-person room", async () => {
      mockFindConversationUnique.mockResolvedValue({ id: "conv-dm" });
      mockChannelMemberFindMany.mockResolvedValue([
        { channelId: "conv-dm", userId: "user-1", selectedLanguages: [], user: { name: "Alice", handle: "alice" } },
        { channelId: "conv-dm", userId: "user-2", selectedLanguages: [], user: { name: "Bob", handle: "bob" } },
      ]);
      mockUserBlockFindFirst.mockResolvedValue({ blockerId: "user-2" });

      const blocked = await isMessageSenderBlockedInConversation({
        sessionKey: "session-dm",
        userId: "user-1",
      });

      expect(blocked).toBe(true);
    });

    it("returns false for an un-blocked 2-person room", async () => {
      mockFindConversationUnique.mockResolvedValue({ id: "conv-dm" });
      mockChannelMemberFindMany.mockResolvedValue([
        { channelId: "conv-dm", userId: "user-1", selectedLanguages: [], user: { name: "Alice", handle: "alice" } },
        { channelId: "conv-dm", userId: "user-2", selectedLanguages: [], user: { name: "Bob", handle: "bob" } },
      ]);

      const blocked = await isMessageSenderBlockedInConversation({
        sessionKey: "session-dm",
        userId: "user-1",
      });

      expect(blocked).toBe(false);
    });

    it("returns false for a group room, even with a block against one member", async () => {
      mockFindConversationUnique.mockResolvedValue({ id: "conv-group" });
      mockChannelMemberFindMany.mockResolvedValue([
        { channelId: "conv-group", userId: "user-1", selectedLanguages: [], user: { name: "Alice", handle: "alice" } },
        { channelId: "conv-group", userId: "user-2", selectedLanguages: [], user: { name: "Bob", handle: "bob" } },
        { channelId: "conv-group", userId: "user-3", selectedLanguages: [], user: { name: "Carol", handle: "carol" } },
      ]);
      mockUserBlockFindFirst.mockResolvedValue({ blockerId: "user-1" });

      const blocked = await isMessageSenderBlockedInConversation({
        sessionKey: "session-group",
        userId: "user-1",
      });

      expect(blocked).toBe(false);
    });

    it("fails closed when the sessionKey doesn't resolve to a channel", async () => {
      mockFindConversationUnique.mockResolvedValue(null);

      const blocked = await isMessageSenderBlockedInConversation({
        sessionKey: "session-unknown",
        userId: "user-1",
      });

      expect(blocked).toBe(true);
    });

    it("fails closed when the sender is not a member of the resolved channel", async () => {
      mockFindConversationUnique.mockResolvedValue({ id: "conv-dm" });
      mockChannelMemberFindMany.mockResolvedValue([
        { channelId: "conv-dm", userId: "user-2", selectedLanguages: [], user: { name: "Bob", handle: "bob" } },
      ]);

      const blocked = await isMessageSenderBlockedInConversation({
        sessionKey: "session-dm",
        userId: "user-1",
      });

      expect(blocked).toBe(true);
    });
  });
});

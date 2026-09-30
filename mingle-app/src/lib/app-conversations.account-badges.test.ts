import { beforeEach, describe, expect, it, vi } from "vitest";

// Account-badge serialization on every chat payload (contract §3 wire rule +
// HARD RULE): flags/kinds appear only when true, and the hydration carries
// operatorDisclosure for rooms with an active, materialized operator member.

const mocks = vi.hoisted(() => ({
  conversationFindFirst: vi.fn(),
  conversationFindMany: vi.fn(),
  memberFindMany: vi.fn(),
  inviteFindMany: vi.fn(),
  userFindMany: vi.fn(),
  blockFindMany: vi.fn(),
  messageFindMany: vi.fn(),
  messageCount: vi.fn(),
  eventLogFindFirst: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    appConversationChannel: { findFirst: mocks.conversationFindFirst, findMany: mocks.conversationFindMany },
    appConversationChannelMember: { findMany: mocks.memberFindMany },
    appConversationChannelInvite: { findMany: mocks.inviteFindMany },
    user: { findMany: mocks.userFindMany },
    userBlock: { findMany: mocks.blockFindMany },
    appMessage: { findMany: mocks.messageFindMany, count: mocks.messageCount },
    appEventLog: { findFirst: mocks.eventLogFindFirst },
  },
}));

vi.mock("@/lib/stt-languages", () => ({
  sanitizeSttLanguageSelection: (value: unknown) => (Array.isArray(value) ? value : []),
  deriveDefaultSttLanguagesForLocale: (locale: string) => [locale || "en"],
}));

vi.mock("@/i18n/conversations", () => ({
  formatLocalizedConversationTitle: (sequenceNumber: number, locale: string) => `${locale}:${sequenceNumber}`,
}));

import {
  getConversationHydrationStateForShare,
  getConversationHydrationStateForUser,
  listConversationChannelsForUser,
  listConversationMembersForUser,
} from "@/lib/app-conversations";

const T0 = new Date("2026-09-01T09:00:00.000Z");
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

function conversationRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "conv-1",
    sequenceNumber: 1,
    title: "Conversation (1)",
    status: "active",
    sessionKey: "session-1",
    selectedLanguages: ["en"],
    speechLanguages: ["en"],
    translationLanguagesLinked: true,
    defaultDisplayLanguage: null,
    pendingInviteeUserIds: [] as string[],
    createdAt: T0,
    updatedAt: T0,
    pausedAt: null,
    userEditedTitleAt: null,
    shareToken: null,
    shareEnabled: false,
    sharedAt: null,
    sharedTitle: null,
    ...overrides,
  };
}

type Flags = { isOfficial?: boolean; isOperator?: boolean };

function memberRow(userId: string, name: string, flags: Flags = {}, extra: { joinedAt?: Date; leftAt?: Date | null } = {}) {
  return {
    channelId: "conv-1",
    userId,
    displayLanguage: null,
    selectedLanguages: ["en"],
    status: "active",
    pausedAt: null,
    lastReadAt: null,
    joinedAt: extra.joinedAt ?? T0,
    leftAt: extra.leftAt ?? null,
    user: {
      name,
      handle: name.toLowerCase(),
      image: null,
      imageCropScale: null,
      imageCropX: null,
      imageCropY: null,
      defaultConversationLanguages: ["en"],
      defaultDisplayLanguage: null,
      nationality: null,
      primaryLanguages: ["en"],
      isOfficial: flags.isOfficial ?? false,
      isOperator: flags.isOperator ?? false,
    },
  };
}

function pendingUser(id: string, name: string, flags: Flags = {}) {
  return {
    id,
    name,
    handle: name.toLowerCase(),
    image: null,
    imageCropScale: null,
    imageCropX: null,
    imageCropY: null,
    defaultConversationLanguages: ["ja"],
    defaultDisplayLanguage: null,
    nationality: null,
    primaryLanguages: ["ja"],
    isOfficial: flags.isOfficial ?? false,
    isOperator: flags.isOperator ?? false,
  };
}

function message(id: string, userId: string, createdAt: Date, text = "hello") {
  return {
    id,
    clientMessageId: `client-${id}`,
    sourceLanguage: "en",
    createdAt,
    metadata: null,
    userId,
    contents: [{ contentType: "SOURCE", language: "en", text }],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.conversationFindFirst.mockResolvedValue(conversationRecord());
  mocks.conversationFindMany.mockResolvedValue([conversationRecord()]);
  mocks.memberFindMany.mockResolvedValue([]);
  mocks.inviteFindMany.mockResolvedValue([]);
  mocks.userFindMany.mockResolvedValue([]);
  mocks.blockFindMany.mockResolvedValue([]);
  mocks.messageFindMany.mockResolvedValue([]);
  mocks.messageCount.mockResolvedValue(0);
  mocks.eventLogFindFirst.mockResolvedValue(null);
});

describe("chat list and member payloads", () => {
  it("selects the badge flags for members and pending invitees", async () => {
    await listConversationChannelsForUser("viewer", { includeMessageSummaries: false });
    const memberSelect = mocks.memberFindMany.mock.calls[0][0].select.user.select;
    expect(memberSelect).toMatchObject({ isOfficial: true, isOperator: true });

    mocks.conversationFindMany.mockResolvedValue([conversationRecord({ pendingInviteeUserIds: ["pending"] })]);
    mocks.userFindMany.mockResolvedValue([pendingUser("pending", "Pending")]);
    await listConversationChannelsForUser("viewer", { includeMessageSummaries: false });
    const pendingCall = mocks.userFindMany.mock.calls.find(([args]) => args?.where?.id?.in?.includes("pending"));
    expect(pendingCall?.[0].select).toMatchObject({ isOfficial: true, isOperator: true });
  });

  it("puts isOperator / isOfficial on otherMembers only when true (list row title + avatars)", async () => {
    mocks.conversationFindMany.mockResolvedValue([conversationRecord({ pendingInviteeUserIds: ["pending-op"] })]);
    mocks.memberFindMany.mockResolvedValue([
      memberRow("viewer", "Viewer"),
      memberRow("op", "Mina", { isOperator: true }),
      memberRow("team", "Mingle", { isOfficial: true }),
      memberRow("plain", "Bob"),
    ]);
    mocks.userFindMany.mockResolvedValue([pendingUser("pending-op", "Yuki", { isOperator: true })]);

    const [room] = await listConversationChannelsForUser("viewer", { includeMessageSummaries: false });

    expect(room.otherMembers).toEqual([
      expect.objectContaining({ userId: "op", isOperator: true }),
      expect.objectContaining({ userId: "team", isOfficial: true }),
      expect.objectContaining({ userId: "plain" }),
      expect.objectContaining({ userId: "pending-op", isOperator: true }),
    ]);
    const byId = new Map(room.otherMembers.map((member) => [member.userId, member]));
    expect(byId.get("op")).not.toHaveProperty("isOfficial");
    expect(byId.get("team")).not.toHaveProperty("isOperator");
    expect(byId.get("plain")).not.toHaveProperty("isOperator");
    expect(byId.get("plain")).not.toHaveProperty("isOfficial");
    // The label never rides on the (renamable) title string.
    expect(room.title).toBe("Mina, Mingle, Bob, Yuki");
  });

  it("keeps a blocked counterpart's label (name stays visible, only the photo is hidden)", async () => {
    mocks.memberFindMany.mockResolvedValue([
      memberRow("viewer", "Viewer"),
      memberRow("op", "Mina", { isOperator: true }),
    ]);
    mocks.blockFindMany.mockResolvedValue([{ blockerId: "viewer", blockedId: "op" }]);

    const [room] = await listConversationChannelsForUser("viewer", { includeMessageSummaries: false });

    expect(room.isBlockedCounterpart).toBe(true);
    expect(room.otherMembers).toEqual([expect.objectContaining({ userId: "op", image: null, isOperator: true })]);
  });

  it("puts the flags on the participants-panel member summaries, including a pending invitee", async () => {
    mocks.conversationFindFirst.mockResolvedValue({ id: "conv-1", pendingInviteeUserIds: ["pending-op"] });
    mocks.memberFindMany.mockResolvedValue([
      memberRow("viewer", "Viewer"),
      memberRow("op", "Mina", { isOperator: true }),
      memberRow("team", "Mingle", { isOfficial: true }),
    ]);
    mocks.userFindMany.mockResolvedValue([pendingUser("pending-op", "Yuki", { isOperator: true })]);

    const members = await listConversationMembersForUser({ conversationId: "conv-1", userId: "viewer" });

    const byId = new Map((members ?? []).map((member) => [member.userId, member]));
    expect(byId.get("viewer")).not.toHaveProperty("isOperator");
    expect(byId.get("viewer")).not.toHaveProperty("isOfficial");
    expect(byId.get("op")).toMatchObject({ isOperator: true });
    expect(byId.get("op")).not.toHaveProperty("isOfficial");
    expect(byId.get("team")).toMatchObject({ isOfficial: true });
    expect(byId.get("pending-op")).toMatchObject({ isOperator: true, blocked: false });
  });
});

describe("room hydration", () => {
  it("labels the operator's bubbles with speakerBadge and leaves ordinary senders without the key", async () => {
    mocks.memberFindMany.mockResolvedValue([
      memberRow("viewer", "Viewer"),
      memberRow("op", "Mina", { isOperator: true }),
      memberRow("team", "Mingle", { isOfficial: true }),
    ]);
    mocks.messageFindMany.mockResolvedValue([
      message("m3", "viewer", at(3)),
      message("m2", "team", at(2)),
      message("m1", "op", at(1)),
    ]);

    const state = await getConversationHydrationStateForUser({ conversationId: "conv-1", userId: "viewer" });
    const [fromOperator, fromOfficial, fromViewer] = state?.utterances ?? [];

    expect(fromOperator).toMatchObject({ speakerUserId: "op", speakerName: "Mina", speakerBadge: "operator" });
    expect(fromOfficial).toMatchObject({ speakerUserId: "team", speakerBadge: "official" });
    expect(fromViewer).not.toHaveProperty("speakerBadge");
  });

  it("does not attach a badge to solo-room diarization turns (no account identity shown)", async () => {
    mocks.memberFindMany.mockResolvedValue([memberRow("op", "Mina", { isOperator: true })]);
    mocks.messageFindMany.mockResolvedValue([message("m1", "op", at(1))]);

    const state = await getConversationHydrationStateForUser({ conversationId: "conv-1", userId: "op" });

    expect(state?.utterances[0]?.speakerName).toBeNull();
    expect(state?.utterances[0]).not.toHaveProperty("speakerBadge");
  });

  it("labels invite and leave notice actors only when they carry a badge", async () => {
    mocks.conversationFindFirst.mockResolvedValue(conversationRecord({ pendingInviteeUserIds: ["pending-op"] }));
    mocks.memberFindMany.mockResolvedValue([
      memberRow("viewer", "Viewer"),
      memberRow("op", "Mina", { isOperator: true }),
      memberRow("gone-op", "Sora", { isOperator: true }, { leftAt: at(5) }),
      memberRow("gone", "Bob", {}, { leftAt: at(6) }),
    ]);
    mocks.userFindMany.mockResolvedValue([pendingUser("pending-op", "Yuki", { isOperator: true })]);
    mocks.inviteFindMany.mockResolvedValue([
      { inviteeUserId: "op", invitedByUserId: "viewer", createdAt: at(1) },
      { inviteeUserId: "pending-op", invitedByUserId: "op", createdAt: at(2) },
      { inviteeUserId: "gone", invitedByUserId: "viewer", createdAt: at(3) },
    ]);

    const state = await getConversationHydrationStateForUser({ conversationId: "conv-1", userId: "viewer" });

    const [inviteOperator, inviteByOperator, invitePlain] = state?.inviteNotices ?? [];
    expect(inviteOperator).toMatchObject({ inviteeName: "Mina", inviteeBadge: "operator" });
    expect(inviteOperator).not.toHaveProperty("invitedByBadge");
    expect(inviteByOperator).toMatchObject({ inviteeName: "Yuki", inviteeBadge: "operator", invitedByBadge: "operator" });
    expect(invitePlain).not.toHaveProperty("inviteeBadge");
    expect(invitePlain).not.toHaveProperty("invitedByBadge");

    const leaves = new Map((state?.leaveNotices ?? []).map((notice) => [notice.userId, notice]));
    expect(leaves.get("gone-op")).toMatchObject({ name: "Sora", isOperator: true });
    expect(leaves.get("gone")).not.toHaveProperty("isOperator");
    expect(leaves.get("gone")).not.toHaveProperty("isOfficial");
  });

  it("sets operatorDisclosure for an active materialized operator member (1:1 and group)", async () => {
    mocks.memberFindMany.mockResolvedValue([memberRow("viewer", "Viewer"), memberRow("op", "Mina", { isOperator: true })]);
    const direct = await getConversationHydrationStateForUser({ conversationId: "conv-1", userId: "viewer" });
    expect(direct?.operatorDisclosure).toBe(true);

    mocks.memberFindMany.mockResolvedValue([
      memberRow("viewer", "Viewer"),
      memberRow("bob", "Bob"),
      memberRow("op", "Mina", { isOperator: true }),
    ]);
    const group = await getConversationHydrationStateForUser({ conversationId: "conv-1", userId: "viewer" });
    expect(group?.operatorDisclosure).toBe(true);

    // The operator's own view (the admin inbox reads as the operator) discloses too.
    const asOperator = await getConversationHydrationStateForUser({ conversationId: "conv-1", userId: "op" });
    expect(asOperator?.operatorDisclosure).toBe(true);
  });

  it("leaves operatorDisclosure false for a pending operator invitee, a departed operator, or an official account", async () => {
    mocks.conversationFindFirst.mockResolvedValue(conversationRecord({ pendingInviteeUserIds: ["pending-op"] }));
    mocks.memberFindMany.mockResolvedValue([memberRow("viewer", "Viewer")]);
    mocks.userFindMany.mockResolvedValue([pendingUser("pending-op", "Yuki", { isOperator: true })]);
    const pending = await getConversationHydrationStateForUser({ conversationId: "conv-1", userId: "viewer" });
    expect(pending?.conversation.otherMembers).toEqual([expect.objectContaining({ userId: "pending-op", isOperator: true })]);
    expect(pending?.operatorDisclosure).toBe(false);

    mocks.conversationFindFirst.mockResolvedValue(conversationRecord());
    mocks.memberFindMany.mockResolvedValue([
      memberRow("viewer", "Viewer"),
      memberRow("bob", "Bob"),
      memberRow("op", "Mina", { isOperator: true }, { leftAt: at(10) }),
    ]);
    const departed = await getConversationHydrationStateForUser({ conversationId: "conv-1", userId: "viewer" });
    expect(departed?.operatorDisclosure).toBe(false);

    mocks.memberFindMany.mockResolvedValue([memberRow("viewer", "Viewer"), memberRow("team", "Mingle", { isOfficial: true })]);
    const official = await getConversationHydrationStateForUser({ conversationId: "conv-1", userId: "viewer" });
    expect(official?.operatorDisclosure).toBe(false);
  });

  it("discloses on a share snapshot only when the operator was a member at the snapshot", async () => {
    const shared = conversationRecord({
      shareToken: "tok",
      shareEnabled: true,
      sharedAt: at(30),
      sharedTitle: "Trip",
      sharedByUserId: "viewer",
    });
    mocks.conversationFindFirst.mockResolvedValue(shared);
    mocks.messageFindMany.mockResolvedValue([message("m1", "op", at(20))]);
    mocks.memberFindMany.mockResolvedValue([
      memberRow("viewer", "Viewer"),
      memberRow("op", "Mina", { isOperator: true }, { joinedAt: at(10) }),
    ]);
    const before = await getConversationHydrationStateForShare({ shareToken: "tok" });
    expect(before?.operatorDisclosure).toBe(true);
    expect(before?.utterances[0]).toMatchObject({ speakerName: "Mina", speakerBadge: "operator" });

    mocks.memberFindMany.mockResolvedValue([
      memberRow("viewer", "Viewer"),
      memberRow("bob", "Bob"),
      memberRow("op", "Mina", { isOperator: true }, { joinedAt: at(40) }),
    ]);
    mocks.messageFindMany.mockResolvedValue([message("m1", "bob", at(20))]);
    const after = await getConversationHydrationStateForShare({ shareToken: "tok" });
    expect(after?.operatorDisclosure).toBe(false);
  });
});

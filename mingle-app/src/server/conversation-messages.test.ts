import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockUserBlockFindFirst,
  mockMemberFindUnique,
  mockMemberFindMany,
  mockMemberCreateMany,
  mockMemberUpdateMany,
  mockMemberUpdate,
  mockUserFindUnique,
  mockUserFindMany,
  mockChannelFindMany,
  mockChannelFindUnique,
  mockChannelUpdate,
  mockMessageFindMany,
  mockMessageUpsert,
  mockMessageCreate,
  mockContentUpsert,
  mockCreateChannelForUser,
  mockTranslateText,
  mockNotifyConversationMessage,
} = vi.hoisted(() => ({
  mockUserBlockFindFirst: vi.fn(),
  mockMemberFindUnique: vi.fn(),
  mockMemberFindMany: vi.fn(),
  mockMemberCreateMany: vi.fn(),
  mockMemberUpdateMany: vi.fn(),
  mockMemberUpdate: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockUserFindMany: vi.fn(),
  mockChannelFindMany: vi.fn(),
  mockChannelFindUnique: vi.fn(),
  mockChannelUpdate: vi.fn(),
  mockMessageFindMany: vi.fn(),
  mockMessageUpsert: vi.fn(),
  mockMessageCreate: vi.fn(),
  mockContentUpsert: vi.fn(),
  mockCreateChannelForUser: vi.fn(),
  mockTranslateText: vi.fn(),
  mockNotifyConversationMessage: vi.fn(),
}));

const txClient = {
  appMessage: { upsert: mockMessageUpsert, create: mockMessageCreate },
  appMessageContent: { upsert: mockContentUpsert },
  appConversationChannel: { update: mockChannelUpdate },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    userBlock: { findFirst: mockUserBlockFindFirst },
    appConversationMember: {
      findUnique: mockMemberFindUnique,
      findMany: mockMemberFindMany,
      createMany: mockMemberCreateMany,
      updateMany: mockMemberUpdateMany,
      update: mockMemberUpdate,
    },
    user: { findUnique: mockUserFindUnique, findMany: mockUserFindMany },
    appConversationChannel: {
      findMany: mockChannelFindMany,
      findUnique: mockChannelFindUnique,
      update: mockChannelUpdate,
    },
    appMessage: { findMany: mockMessageFindMany },
    // Backfilling a translation for a message already in the thread writes
    // outside the send transaction, so this is reached directly too.
    appMessageContent: { upsert: mockContentUpsert },
    $transaction: (fn: (tx: typeof txClient) => unknown) => fn(txClient),
  },
}));

vi.mock("@/lib/app-conversations", () => ({
  APP_CONVERSATION_MEMBER_ROLE_OWNER: "owner",
  APP_CONVERSATION_MEMBER_ROLE_MEMBER: "member",
  createConversationChannelForUser: mockCreateChannelForUser,
}));

vi.mock("@/server/translate-text", () => ({
  translateText: mockTranslateText,
}));

vi.mock("@/server/conversation-realtime", () => ({
  notifyConversationMessage: mockNotifyConversationMessage,
}));

import {
  CONVERSATION_MAX_PARTICIPANTS,
  CONVERSATION_MESSAGE_TEXT_MAX_LENGTH,
  ConversationMessageError,
  getMemberDisplayLanguages,
  getOrCreateConversationWith,
  getOrCreateDirectConversation,
  listConversationMessages,
  markConversationRead,
  sendConversationMessage,
  setMemberDisplayLanguages,
  TRANSLATION_BACKFILL_MESSAGE_LIMIT,
} from "@/server/conversation-messages";

const CHANNEL_ROW = {
  id: "conv-1",
  sequenceNumber: 1,
  title: "Room",
  status: "active",
  sessionKey: "sess-1",
  selectedLanguages: ["ko"],
  speechLanguages: ["ko"],
  translationLanguagesLinked: true,
  defaultDisplayLanguage: null,
  createdAt: new Date("2026-08-18T00:00:00.000Z"),
  updatedAt: new Date("2026-08-18T00:00:00.000Z"),
  pausedAt: null,
};

async function expectReason(promise: Promise<unknown>, reason: string) {
  await expect(promise).rejects.toBeInstanceOf(ConversationMessageError);
  await promise.catch((error: ConversationMessageError) => {
    expect(error.reason).toBe(reason);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUserBlockFindFirst.mockResolvedValue(null);
  // Echoes back whatever id was requested, so a test that resolves to a
  // specific room (e.g. an existing "group-room") can assert on that id
  // instead of silently reading the fixture's "conv-1".
  mockChannelFindUnique.mockImplementation(({ where }: { where: { id: string } }) => Promise.resolve({
    ...CHANNEL_ROW,
    id: where.id,
  }));
});

describe("getOrCreateConversationWith", () => {
  beforeEach(() => {
    // Default: the viewer already belongs to one room, so the channel lookup
    // (scoped to that room) has something to check the other participants against.
    mockMemberFindMany.mockResolvedValue([{ conversationId: "conv-1" }]);
  });

  it("refuses an empty participant list", async () => {
    await expectReason(
      getOrCreateConversationWith({ viewerId: "u1", participantIds: [] }),
      "no_participants",
    );
    expect(mockUserFindMany).not.toHaveBeenCalled();
  });

  it("refuses a list naming only the viewer", async () => {
    await expectReason(
      getOrCreateConversationWith({ viewerId: "u1", participantIds: ["u1"] }),
      "cannot_message_self",
    );
  });

  it("scopes the room search to the viewer's own rooms instead of scanning every room in the app", async () => {
    mockUserFindMany.mockResolvedValue([{ id: "u2" }]);
    mockMemberFindMany.mockResolvedValue([{ conversationId: "conv-1" }, { conversationId: "conv-2" }]);
    mockChannelFindMany.mockResolvedValue([{ id: "conv-1", _count: { members: 2 } }]);

    await getOrCreateConversationWith({ viewerId: "u1", participantIds: ["u2"] });

    expect(mockMemberFindMany).toHaveBeenCalledWith({
      where: { userId: "u1" },
      select: { conversationId: true },
    });
    expect(mockChannelFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: { in: ["conv-1", "conv-2"] } }),
    }));
  });

  it("skips the room query entirely when the viewer isn't in any room yet", async () => {
    mockUserFindMany.mockResolvedValue([{ id: "u2" }]);
    mockMemberFindMany.mockResolvedValue([]);
    mockCreateChannelForUser.mockResolvedValue({ id: "conv-new" });

    const conversation = await getOrCreateConversationWith({ viewerId: "u1", participantIds: ["u2"] });

    expect(mockChannelFindMany).not.toHaveBeenCalled();
    expect(conversation.id).toBe("conv-new");
  });

  it("dedupes participant ids before counting them", async () => {
    mockUserFindMany.mockResolvedValue([{ id: "u2" }]);
    mockChannelFindMany.mockResolvedValue([]);
    mockCreateChannelForUser.mockResolvedValue({ id: "conv-new" });

    await getOrCreateConversationWith({ viewerId: "u1", participantIds: ["u2", "u2", "u1"] });

    expect(mockUserFindMany).toHaveBeenCalledWith({
      where: { id: { in: ["u2"] } },
      select: { id: true },
    });
  });

  it("rejects rooms beyond the participant cap", async () => {
    const tooMany = Array.from({ length: CONVERSATION_MAX_PARTICIPANTS }, (_, i) => `u${i + 2}`);

    await expectReason(
      getOrCreateConversationWith({ viewerId: "u1", participantIds: tooMany }),
      "too_many_participants",
    );
    expect(mockUserFindMany).not.toHaveBeenCalled();
  });

  it("refuses when any two of the requested participants have blocked each other", async () => {
    mockUserFindMany.mockResolvedValue([{ id: "u2" }, { id: "u3" }]);
    mockUserBlockFindFirst.mockResolvedValue({ id: "block-1" });

    await expectReason(
      getOrCreateConversationWith({ viewerId: "u1", participantIds: ["u2", "u3"] }),
      "user_blocked",
    );

    expect(mockUserBlockFindFirst).toHaveBeenCalledWith({
      where: {
        blockerId: { in: ["u1", "u2", "u3"] },
        blockedId: { in: ["u1", "u2", "u3"] },
      },
      select: { id: true },
    });
    expect(mockChannelFindMany).not.toHaveBeenCalled();
  });

  it("refuses an unknown participant", async () => {
    mockUserFindMany.mockResolvedValue([{ id: "u2" }]); // u3 missing

    await expectReason(
      getOrCreateConversationWith({ viewerId: "u1", participantIds: ["u2", "u3"] }),
      "user_not_found",
    );
  });

  it("does not resolve a 1:1 request to a larger room that merely contains both people", async () => {
    mockUserFindMany.mockResolvedValue([{ id: "u2" }]);
    // A 3-person group room contains u1 and u2, but is not an exact match for [u1, u2].
    mockChannelFindMany.mockResolvedValue([
      { id: "group-room", _count: { members: 3 } },
    ]);
    mockCreateChannelForUser.mockResolvedValue({ id: "conv-new" });

    const conversation = await getOrCreateConversationWith({ viewerId: "u1", participantIds: ["u2"] });

    expect(conversation.id).toBe("conv-new");
    expect(mockCreateChannelForUser).toHaveBeenCalled();
  });

  it("reuses the room whose member count matches exactly", async () => {
    mockUserFindMany.mockResolvedValue([{ id: "u2" }, { id: "u3" }]);
    mockChannelFindMany.mockResolvedValue([
      { id: "group-room", _count: { members: 3 } },
    ]);

    const conversation = await getOrCreateConversationWith({
      viewerId: "u1",
      participantIds: ["u2", "u3"],
    });

    expect(conversation.id).toBe("group-room");
    expect(mockCreateChannelForUser).not.toHaveBeenCalled();
  });

  it("creates a group room and adds every participant as a member", async () => {
    mockUserFindMany.mockResolvedValue([{ id: "u2" }, { id: "u3" }]);
    mockChannelFindMany.mockResolvedValue([]);
    mockCreateChannelForUser.mockResolvedValue({ id: "conv-new" });

    await getOrCreateConversationWith({ viewerId: "u1", participantIds: ["u2", "u3"] });

    expect(mockMemberCreateMany).toHaveBeenCalledWith({
      data: [
        { conversationId: "conv-new", userId: "u2", role: "member" },
        { conversationId: "conv-new", userId: "u3", role: "member" },
      ],
      skipDuplicates: true,
    });
  });
});

describe("getOrCreateDirectConversation (1:1 convenience wrapper)", () => {
  it("delegates to getOrCreateConversationWith with a single participant", async () => {
    mockUserFindMany.mockResolvedValue([{ id: "u2" }]);
    mockMemberFindMany.mockResolvedValue([{ conversationId: "conv-1" }]);
    mockChannelFindMany.mockResolvedValue([{ id: "conv-1", _count: { members: 2 } }]);

    const conversation = await getOrCreateDirectConversation({ viewerId: "u1", partnerId: "u2" });

    expect(conversation.id).toBe("conv-1");
  });
});

describe("listConversationMessages", () => {
  beforeEach(() => {
    // Default viewer: no extra languages added, signup language "en" — tests
    // that care about which translations surface override this explicitly.
    mockMemberFindUnique.mockResolvedValue({ displayLanguages: [], user: { primaryLanguages: ["en"] } });
    // Default to a provider that yields nothing, so reads exercise only what
    // is already stored unless a test opts into backfill explicitly.
    mockTranslateText.mockResolvedValue({});
  });

  it("rejects a non-member before reading anything", async () => {
    mockMemberFindUnique.mockResolvedValue(null);

    await expectReason(
      listConversationMessages({ conversationId: "conv-1", viewerId: "outsider" }),
      "not_a_member",
    );
    expect(mockMessageFindMany).not.toHaveBeenCalled();
  });

  it("returns messages oldest-first and flags the viewer's own", async () => {
    mockMessageFindMany.mockResolvedValue([
      {
        id: "msg-2",
        clientMessageId: null,
        kind: "text",
        sourceLanguage: "ko",
        createdAt: new Date("2026-08-18T00:00:02.000Z"),
        senderId: "u2",
        sender: { id: "u2", handle: "bee", name: "Bee", image: null },
        contents: [{ contentType: "SOURCE", text: "second" }],
      },
      {
        id: "msg-1",
        clientMessageId: null,
        kind: "text",
        sourceLanguage: "ko",
        createdAt: new Date("2026-08-18T00:00:01.000Z"),
        senderId: "u1",
        sender: { id: "u1", handle: "ann", name: "Ann", image: null },
        contents: [{ contentType: "SOURCE", text: "first" }],
      },
    ]);

    const messages = await listConversationMessages({ conversationId: "conv-1", viewerId: "u1" });

    expect(messages.map((m) => m.originalText)).toEqual(["first", "second"]);
    expect(messages.map((m) => m.isMine)).toEqual([true, false]);
  });

  it("reads only text messages so speech transcripts stay out of the thread", async () => {
    mockMessageFindMany.mockResolvedValue([]);

    await listConversationMessages({ conversationId: "conv-1", viewerId: "u1" });

    expect(mockMessageFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ conversationId: "conv-1", kind: "text" }),
    }));
  });

  it("only returns translations for languages the viewer currently has selected", async () => {
    // The message carries translations for three languages (other members'
    // picks too), but this viewer only reads "en" — everything else must be
    // held back even though it's sitting right there in the row.
    mockMemberFindUnique.mockResolvedValue({ displayLanguages: [], user: { primaryLanguages: ["en"] } });
    mockMessageFindMany.mockResolvedValue([{
      id: "msg-1",
      clientMessageId: null,
      kind: "text",
      sourceLanguage: "ko",
      createdAt: new Date("2026-08-18T00:00:01.000Z"),
      senderId: "u2",
      sender: { id: "u2", handle: "bee", name: "Bee", image: null },
      contents: [
        { contentType: "SOURCE", language: "ko", text: "안녕" },
        { contentType: "TRANSLATION_FINAL", language: "en", text: "Hello" },
        { contentType: "TRANSLATION_FINAL", language: "ja", text: "こんにちは" },
        { contentType: "TRANSLATION_FINAL", language: "fr", text: "Bonjour" },
      ],
    }]);

    const messages = await listConversationMessages({ conversationId: "conv-1", viewerId: "u1" });

    expect(messages[0].originalText).toBe("안녕");
    expect(messages[0].translations).toEqual({ en: "Hello" });
  });

  it("picks up an added language on the very next read, without the message needing to be re-sent", async () => {
    const messageRow = {
      id: "msg-1",
      clientMessageId: null,
      kind: "text",
      sourceLanguage: "ko",
      createdAt: new Date("2026-08-18T00:00:01.000Z"),
      senderId: "u2",
      sender: { id: "u2", handle: "bee", name: "Bee", image: null },
      contents: [
        { contentType: "SOURCE", language: "ko", text: "안녕" },
        { contentType: "TRANSLATION_FINAL", language: "ja", text: "こんにちは" },
      ],
    };
    mockMessageFindMany.mockResolvedValue([messageRow]);

    mockMemberFindUnique.mockResolvedValue({ displayLanguages: [], user: { primaryLanguages: ["en"] } });
    const before = await listConversationMessages({ conversationId: "conv-1", viewerId: "u1" });
    expect(before[0].translations).toEqual({});

    // Same stored message, viewer adds "ja" — no new send, no re-translation.
    mockMemberFindUnique.mockResolvedValue({ displayLanguages: ["ja"], user: { primaryLanguages: ["en"] } });
    const after = await listConversationMessages({ conversationId: "conv-1", viewerId: "u1" });
    expect(after[0].translations).toEqual({ ja: "こんにちは" });
  });

  it("translates and stores a language added after the message was already sent", async () => {
    // The thread predates the viewer adding Japanese, so nothing Japanese was
    // ever written for this message. Reading it must produce the badge anyway.
    mockMessageFindMany.mockResolvedValue([{
      id: "msg-1",
      clientMessageId: null,
      kind: "text",
      sourceLanguage: "ko",
      createdAt: new Date("2026-08-18T00:00:01.000Z"),
      senderId: "u2",
      sender: { id: "u2", handle: "bee", name: "Bee", image: null },
      contents: [{ contentType: "SOURCE", language: "ko", text: "안녕" }],
    }]);
    mockMemberFindUnique.mockResolvedValue({
      displayLanguages: ["ja"],
      user: { primaryLanguages: ["ko"] },
    });
    mockTranslateText.mockResolvedValue({ ja: "こんにちは" });

    const messages = await listConversationMessages({ conversationId: "conv-1", viewerId: "u1", backfillTranslations: true });

    expect(mockTranslateText).toHaveBeenCalledWith(expect.objectContaining({
      text: "안녕",
      sourceLanguage: "ko",
      targetLanguages: ["ja"],
    }));
    expect(messages[0].translations).toEqual({ ja: "こんにちは" });
    // Persisted, so the next read costs nothing.
    expect(mockContentUpsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        messageId: "msg-1",
        contentType: "TRANSLATION_FINAL",
        language: "ja",
        text: "こんにちは",
      }),
    }));
  });

  it("never re-translates a language already stored, or the source language itself", async () => {
    mockMessageFindMany.mockResolvedValue([{
      id: "msg-1",
      clientMessageId: null,
      kind: "text",
      sourceLanguage: "ko",
      createdAt: new Date("2026-08-18T00:00:01.000Z"),
      senderId: "u2",
      sender: { id: "u2", handle: "bee", name: "Bee", image: null },
      contents: [
        { contentType: "SOURCE", language: "ko", text: "안녕" },
        { contentType: "TRANSLATION_FINAL", language: "ja", text: "こんにちは" },
      ],
    }]);
    mockMemberFindUnique.mockResolvedValue({
      displayLanguages: ["ja", "ko"],
      user: { primaryLanguages: ["ko"] },
    });

    const messages = await listConversationMessages({ conversationId: "conv-1", viewerId: "u1", backfillTranslations: true });

    expect(mockTranslateText).not.toHaveBeenCalled();
    expect(mockContentUpsert).not.toHaveBeenCalled();
    expect(messages[0].translations).toEqual({ ja: "こんにちは" });
  });

  it("leaves the gap for a later read when the translation provider fails", async () => {
    mockMessageFindMany.mockResolvedValue([{
      id: "msg-1",
      clientMessageId: null,
      kind: "text",
      sourceLanguage: "ko",
      createdAt: new Date("2026-08-18T00:00:01.000Z"),
      senderId: "u2",
      sender: { id: "u2", handle: "bee", name: "Bee", image: null },
      contents: [{ contentType: "SOURCE", language: "ko", text: "안녕" }],
    }]);
    mockMemberFindUnique.mockResolvedValue({
      displayLanguages: ["ja"],
      user: { primaryLanguages: ["ko"] },
    });
    mockTranslateText.mockResolvedValue({});

    const messages = await listConversationMessages({ conversationId: "conv-1", viewerId: "u1", backfillTranslations: true });

    // The read still succeeds — a translation outage must never blank a thread.
    expect(messages[0].originalText).toBe("안녕");
    expect(messages[0].translations).toEqual({});
    expect(mockContentUpsert).not.toHaveBeenCalled();
  });

  it("does not translate anything on an ordinary read, so polling stays cheap", async () => {
    mockMessageFindMany.mockResolvedValue([{
      id: "msg-1",
      clientMessageId: null,
      kind: "text",
      sourceLanguage: "ko",
      createdAt: new Date("2026-08-18T00:00:01.000Z"),
      senderId: "u2",
      sender: { id: "u2", handle: "bee", name: "Bee", image: null },
      contents: [{ contentType: "SOURCE", language: "ko", text: "안녕" }],
    }]);
    mockMemberFindUnique.mockResolvedValue({
      displayLanguages: ["ja"],
      user: { primaryLanguages: ["ko"] },
    });
    mockTranslateText.mockResolvedValue({ ja: "こんにちは" });

    // No backfillTranslations flag — this is what the 4-second poll sends.
    await listConversationMessages({ conversationId: "conv-1", viewerId: "u1" });

    expect(mockTranslateText).not.toHaveBeenCalled();
    expect(mockContentUpsert).not.toHaveBeenCalled();
  });

  it("bounds how many messages one read will backfill", async () => {
    mockMessageFindMany.mockResolvedValue(
      Array.from({ length: TRANSLATION_BACKFILL_MESSAGE_LIMIT + 5 }, (_unused, index) => ({
        id: `msg-${index}`,
        clientMessageId: null,
        kind: "text",
        sourceLanguage: "ko",
        createdAt: new Date("2026-08-18T00:00:01.000Z"),
        senderId: "u2",
        sender: { id: "u2", handle: "bee", name: "Bee", image: null },
        contents: [{ contentType: "SOURCE", language: "ko", text: "안녕" }],
      })),
    );
    mockMemberFindUnique.mockResolvedValue({
      displayLanguages: ["ja"],
      user: { primaryLanguages: ["ko"] },
    });
    mockTranslateText.mockResolvedValue({ ja: "こんにちは" });

    await listConversationMessages({ conversationId: "conv-1", viewerId: "u1", backfillTranslations: true });

    expect(mockTranslateText).toHaveBeenCalledTimes(TRANSLATION_BACKFILL_MESSAGE_LIMIT);
  });

  it("returns an empty translations map when no translation landed", async () => {
    mockMessageFindMany.mockResolvedValue([{
      id: "msg-1",
      clientMessageId: null,
      kind: "text",
      sourceLanguage: "ko",
      createdAt: new Date("2026-08-18T00:00:01.000Z"),
      senderId: "u2",
      sender: { id: "u2", handle: "bee", name: "Bee", image: null },
      contents: [{ contentType: "SOURCE", language: "ko", text: "안녕" }],
    }]);

    const messages = await listConversationMessages({ conversationId: "conv-1", viewerId: "u1" });

    expect(messages[0].originalText).toBe("안녕");
    expect(messages[0].translations).toEqual({});
  });
});

describe("sendConversationMessage", () => {
  beforeEach(() => {
    mockMemberFindUnique.mockResolvedValue({ id: "m1" });
    mockMemberFindMany.mockResolvedValue([
      { userId: "u1", displayLanguages: [], user: { primaryLanguages: ["ko"] } },
      { userId: "u2", displayLanguages: [], user: { primaryLanguages: ["en"] } },
      { userId: "u3", displayLanguages: [], user: { primaryLanguages: ["en"] } },
    ]);
    mockUserFindUnique.mockResolvedValue({
      primaryLanguages: ["ko"],
      id: "u1",
      handle: "ann",
      name: "Ann",
      image: null,
    });
    mockMessageUpsert.mockResolvedValue({ id: "msg-1", createdAt: new Date("2026-08-18T00:00:00.000Z") });
    mockMessageCreate.mockResolvedValue({ id: "msg-1", createdAt: new Date("2026-08-18T00:00:00.000Z") });
    mockTranslateText.mockResolvedValue({});
  });

  it("rejects whitespace-only text", async () => {
    await expectReason(
      sendConversationMessage({ conversationId: "conv-1", senderId: "u1", text: "   " }),
      "empty_text",
    );
    expect(mockMessageCreate).not.toHaveBeenCalled();
  });

  it("rejects a non-member", async () => {
    mockMemberFindUnique.mockResolvedValue(null);

    await expectReason(
      sendConversationMessage({ conversationId: "conv-1", senderId: "outsider", text: "hi" }),
      "not_a_member",
    );
    expect(mockMessageCreate).not.toHaveBeenCalled();
  });

  it("checks blocks across every member of a group room, not just the sender", async () => {
    mockUserBlockFindFirst.mockResolvedValue({ id: "block-1" });

    await expectReason(
      sendConversationMessage({ conversationId: "conv-1", senderId: "u1", text: "hi" }),
      "user_blocked",
    );

    expect(mockUserBlockFindFirst).toHaveBeenCalledWith({
      where: {
        blockerId: { in: ["u1", "u2", "u3"] },
        blockedId: { in: ["u1", "u2", "u3"] },
      },
      select: { id: true },
    });
    expect(mockMessageCreate).not.toHaveBeenCalled();
  });

  it("notifies mingle-stt so anyone watching this conversation can be pushed the new message", async () => {
    const message = await sendConversationMessage({ conversationId: "conv-1", senderId: "u1", text: "hi" });

    expect(mockNotifyConversationMessage).toHaveBeenCalledWith({
      conversationId: "conv-1",
      messageId: message.id,
    });
  });

  it("sends in the language that was actually spoken, not the sender's signup language", async () => {
    // u1 signed up in Korean but dictated this message in Spanish. Labelling it
    // "ko" would both mistranslate it and skip translating it into Spanish.
    const message = await sendConversationMessage({
      conversationId: "conv-1",
      senderId: "u1",
      text: "hola",
      sourceLanguage: "es",
    });

    expect(message.sourceLanguage).toBe("es");
    expect(mockTranslateText).toHaveBeenCalledWith(expect.objectContaining({
      sourceLanguage: "es",
      targetLanguages: ["ko", "en"],
    }));
  });

  it("falls back to the signup language when the spoken language is absent or unrecognized", async () => {
    const withoutSpoken = await sendConversationMessage({
      conversationId: "conv-1",
      senderId: "u1",
      text: "안녕",
    });
    const withGarbage = await sendConversationMessage({
      conversationId: "conv-1",
      senderId: "u1",
      text: "안녕",
      sourceLanguage: "   ",
    });

    expect(withoutSpoken.sourceLanguage).toBe("ko");
    expect(withGarbage.sourceLanguage).toBe("ko");
  });

  it("upserts on the client message id so a retry cannot duplicate", async () => {
    await sendConversationMessage({
      conversationId: "conv-1",
      senderId: "u1",
      text: "hi",
      clientMessageId: "cid-1",
    });

    expect(mockMessageCreate).not.toHaveBeenCalled();
    expect(mockMessageUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        conversationId_clientMessageId: { conversationId: "conv-1", clientMessageId: "cid-1" },
      },
      update: {},
    }));
  });

  it("plain-creates when the client sent no idempotency key", async () => {
    await sendConversationMessage({ conversationId: "conv-1", senderId: "u1", text: "hi" });

    expect(mockMessageUpsert).not.toHaveBeenCalled();
    expect(mockMessageCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ kind: "text", senderId: "u1", conversationId: "conv-1" }),
    }));
  });

  it("trims and caps the stored text", async () => {
    const long = `  ${"a".repeat(CONVERSATION_MESSAGE_TEXT_MAX_LENGTH + 50)}  `;

    const message = await sendConversationMessage({ conversationId: "conv-1", senderId: "u1", text: long });

    expect(message.originalText).toHaveLength(CONVERSATION_MESSAGE_TEXT_MAX_LENGTH);
    expect(mockContentUpsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ contentType: "SOURCE", language: "ko" }),
    }));
  });

  it("bumps the room so it rises in every member's list", async () => {
    await sendConversationMessage({ conversationId: "conv-1", senderId: "u1", text: "hi" });

    expect(mockChannelUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "conv-1" },
    }));
  });

  it("translates into every other member's language, deduped, minus whatever equals the source", async () => {
    await sendConversationMessage({ conversationId: "conv-1", senderId: "u1", text: "hi" });

    // u2 and u3 both read "en"; that collapses to one target language and one
    // translation call, not one per recipient. u1 (the sender) reads "ko",
    // same as the source text, so it drops out too.
    expect(mockTranslateText).toHaveBeenCalledWith({
      text: "hi",
      sourceLanguage: "ko",
      targetLanguages: ["en"],
      sessionKey: "conv-1",
    });
  });

  it("also translates into the sender's own added languages, so their sent bubble gets those badges too", async () => {
    mockMemberFindMany.mockResolvedValue([
      { userId: "u1", displayLanguages: ["fr"], user: { primaryLanguages: ["ko"] } },
      { userId: "u2", displayLanguages: [], user: { primaryLanguages: ["en"] } },
    ]);

    await sendConversationMessage({ conversationId: "conv-1", senderId: "u1", text: "hi" });

    expect(mockTranslateText).toHaveBeenCalledWith(expect.objectContaining({
      targetLanguages: expect.arrayContaining(["en", "fr"]),
    }));
  });

  it("also translates into a member's added languages, on top of their signup language", async () => {
    mockMemberFindMany.mockResolvedValue([
      { userId: "u1", displayLanguages: [], user: { primaryLanguages: ["ko"] } },
      { userId: "u2", displayLanguages: ["ja", "fr"], user: { primaryLanguages: ["en"] } },
    ]);

    await sendConversationMessage({ conversationId: "conv-1", senderId: "u1", text: "hi" });

    expect(mockTranslateText).toHaveBeenCalledWith(expect.objectContaining({
      targetLanguages: expect.arrayContaining(["ja", "fr"]),
    }));
  });

  it("reads a member's languages as exactly what they added, not their signup language too, once they've added any", async () => {
    // u2 explicitly set ["fr"]; their signup language "en" should not sneak
    // back in as an extra target — the member's own choice is authoritative.
    mockMemberFindMany.mockResolvedValue([
      { userId: "u1", displayLanguages: [], user: { primaryLanguages: ["ko"] } },
      { userId: "u2", displayLanguages: ["fr"], user: { primaryLanguages: ["en"] } },
    ]);

    await sendConversationMessage({ conversationId: "conv-1", senderId: "u1", text: "hi" });

    expect(mockTranslateText).toHaveBeenCalledWith(expect.objectContaining({
      targetLanguages: ["fr"],
    }));
  });

  it("stores each returned translation as a TRANSLATION_FINAL content row", async () => {
    mockTranslateText.mockResolvedValue({ en: "Hello", ja: "こんにちは" });

    await sendConversationMessage({ conversationId: "conv-1", senderId: "u1", text: "안녕" });

    expect(mockContentUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { messageId_contentType_language: { messageId: "msg-1", contentType: "TRANSLATION_FINAL", language: "en" } },
      create: expect.objectContaining({ contentType: "TRANSLATION_FINAL", language: "en", text: "Hello" }),
    }));
    expect(mockContentUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { messageId_contentType_language: { messageId: "msg-1", contentType: "TRANSLATION_FINAL", language: "ja" } },
      create: expect.objectContaining({ contentType: "TRANSLATION_FINAL", language: "ja", text: "こんにちは" }),
    }));
  });

  it("still sends the message when translation fails or comes back empty", async () => {
    mockTranslateText.mockResolvedValue({});

    const message = await sendConversationMessage({ conversationId: "conv-1", senderId: "u1", text: "hi" });

    expect(message.originalText).toBe("hi");
    expect(mockContentUpsert).toHaveBeenCalledTimes(1); // SOURCE only, no TRANSLATION_FINAL rows
  });
});

describe("markConversationRead", () => {
  it("stamps only the reader's own membership row", async () => {
    await markConversationRead({ conversationId: "conv-1", userId: "u1" });

    expect(mockMemberUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { conversationId: "conv-1", userId: "u1" },
    }));
  });
});

describe("getMemberDisplayLanguages", () => {
  it("returns the caller's added languages alongside their signup default", async () => {
    mockMemberFindUnique.mockResolvedValue({
      id: "m1",
      displayLanguages: ["fr", "ja"],
      user: { primaryLanguages: ["en"] },
    });

    const result = await getMemberDisplayLanguages({ conversationId: "conv-1", userId: "u1" });

    expect(result).toEqual({ displayLanguages: ["fr", "ja"], defaultLanguage: "en" });
  });

  it("rejects a non-member", async () => {
    mockMemberFindUnique.mockResolvedValue(null);

    await expectReason(
      getMemberDisplayLanguages({ conversationId: "conv-1", userId: "outsider" }),
      "not_a_member",
    );
  });
});

describe("setMemberDisplayLanguages", () => {
  it("rejects a non-member", async () => {
    mockMemberFindUnique.mockResolvedValue(null);

    await expectReason(
      setMemberDisplayLanguages({ conversationId: "conv-1", userId: "outsider", displayLanguages: ["fr"] }),
      "not_a_member",
    );
    expect(mockMemberUpdate).not.toHaveBeenCalled();
  });

  it("replaces only the caller's own membership row with the new language list", async () => {
    mockMemberFindUnique.mockResolvedValue({ id: "m1" });

    await setMemberDisplayLanguages({ conversationId: "conv-1", userId: "u1", displayLanguages: ["fr", "ja"] });

    expect(mockMemberUpdate).toHaveBeenCalledWith({
      where: { conversationId_userId: { conversationId: "conv-1", userId: "u1" } },
      data: { displayLanguages: ["fr", "ja"] },
    });
  });
});

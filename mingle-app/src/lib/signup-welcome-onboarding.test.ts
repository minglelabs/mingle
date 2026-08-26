import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockUserFindFirst,
  mockUserFindUnique,
  mockUserFollowUpsert,
  mockUserNotificationFindFirst,
  mockUserNotificationCreate,
  mockAppMessageUpsert,
  mockAppMessageContentUpsert,
  mockAppMessageContentUpdateMany,
  mockMemberUpdateMany,
  mockTransaction,
  mockFindOrCreateDirectConversation,
  mockMaterializePendingConversationInvitees,
  mockListChannelMemberUserIdsBySessionKey,
  mockNotifyConversationMessage,
  mockSendPushNotificationForUserNotification,
  mockSendPushNotificationForConversationMessage,
} = vi.hoisted(() => ({
  mockUserFindFirst: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockUserFollowUpsert: vi.fn(),
  mockUserNotificationFindFirst: vi.fn(),
  mockUserNotificationCreate: vi.fn(),
  mockAppMessageUpsert: vi.fn(),
  mockAppMessageContentUpsert: vi.fn(),
  mockAppMessageContentUpdateMany: vi.fn(),
  mockMemberUpdateMany: vi.fn(),
  mockTransaction: vi.fn(),
  mockFindOrCreateDirectConversation: vi.fn(),
  mockMaterializePendingConversationInvitees: vi.fn(),
  mockListChannelMemberUserIdsBySessionKey: vi.fn(),
  mockNotifyConversationMessage: vi.fn(),
  mockSendPushNotificationForUserNotification: vi.fn(),
  mockSendPushNotificationForConversationMessage: vi.fn(),
}));

const transactionClient = {
  userFollow: { upsert: mockUserFollowUpsert },
  userNotification: {
    findFirst: mockUserNotificationFindFirst,
    create: mockUserNotificationCreate,
  },
  appMessage: { upsert: mockAppMessageUpsert },
  appMessageContent: { upsert: mockAppMessageContentUpsert, updateMany: mockAppMessageContentUpdateMany },
  appConversationChannelMember: { updateMany: mockMemberUpdateMany },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findFirst: mockUserFindFirst, findUnique: mockUserFindUnique },
    $transaction: mockTransaction,
  },
}));

vi.mock("@/lib/app-conversations", () => ({
  findOrCreateDirectConversation: mockFindOrCreateDirectConversation,
  materializePendingConversationInvitees: mockMaterializePendingConversationInvitees,
  listChannelMemberUserIdsBySessionKey: mockListChannelMemberUserIdsBySessionKey,
}));

vi.mock("@/server/conversation-realtime", () => ({
  notifyConversationMessage: mockNotifyConversationMessage,
}));

vi.mock("@/server/push-notifications", () => ({
  sendPushNotificationForUserNotification: mockSendPushNotificationForUserNotification,
  sendPushNotificationForConversationMessage: mockSendPushNotificationForConversationMessage,
}));

import {
  ensureSignupWelcomeOnboarding,
  ROYCE_USER_ID,
  ROYCE_WELCOME_MESSAGE,
} from "@/lib/signup-welcome-onboarding";
import { ROYCE_WELCOME_TRANSLATIONS } from "@/lib/royce-welcome-translations";

describe("signup welcome onboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserFindFirst.mockResolvedValue({ id: ROYCE_USER_ID });
    mockUserFindUnique.mockResolvedValue({ defaultConversationLanguages: ["ko", "en"] });
    mockTransaction.mockImplementation(async (callback: (tx: typeof transactionClient) => unknown) => (
      callback(transactionClient)
    ));
    mockUserFollowUpsert.mockResolvedValue({ id: "follow_1" });
    mockUserNotificationFindFirst.mockResolvedValue(null);
    mockUserNotificationCreate
      .mockResolvedValueOnce({ id: "notification_royce" })
      .mockResolvedValueOnce({ id: "notification_new_user" });
    mockFindOrCreateDirectConversation.mockResolvedValue({
      conversation: {
        sessionKey: "session-welcome",
      },
      reused: false,
    });
    mockMaterializePendingConversationInvitees.mockResolvedValue([
      "new_user",
      ROYCE_USER_ID,
    ]);
    mockListChannelMemberUserIdsBySessionKey.mockResolvedValue([
      "new_user",
      ROYCE_USER_ID,
    ]);
    mockAppMessageUpsert.mockResolvedValue({ id: "message_welcome" });
    mockAppMessageContentUpsert.mockResolvedValue({ id: "content_welcome" });
    mockMemberUpdateMany.mockResolvedValue({ count: 1 });
    mockAppMessageContentUpdateMany.mockResolvedValue({ count: 0 });
  });

  it("creates reciprocal follows, both follow notifications, and one unread welcome message", async () => {
    await ensureSignupWelcomeOnboarding({ userId: "new_user", locale: "ko" });

    expect(mockUserFollowUpsert).toHaveBeenCalledTimes(2);
    expect(mockUserFollowUpsert).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: {
        followerId_followingId: {
          followerId: "new_user",
          followingId: ROYCE_USER_ID,
        },
      },
    }));
    expect(mockUserFollowUpsert).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: {
        followerId_followingId: {
          followerId: ROYCE_USER_ID,
          followingId: "new_user",
        },
      },
    }));
    expect(mockUserNotificationCreate).toHaveBeenNthCalledWith(1, expect.objectContaining({
      data: {
        recipientId: ROYCE_USER_ID,
        actorId: "new_user",
        type: "follow",
      },
    }));
    expect(mockUserNotificationCreate).toHaveBeenNthCalledWith(2, expect.objectContaining({
      data: {
        recipientId: "new_user",
        actorId: ROYCE_USER_ID,
        type: "follow",
      },
    }));
    expect(mockSendPushNotificationForUserNotification).toHaveBeenCalledTimes(2);
    expect(mockFindOrCreateDirectConversation).toHaveBeenCalledWith({
      userId: "new_user",
      targetUserId: ROYCE_USER_ID,
      locale: "ko",
    });
    expect(mockAppMessageUpsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        userId: ROYCE_USER_ID,
        sessionKey: "session-welcome",
        clientMessageId: "mingle-welcome-royce-v1",
        sourceLanguage: "en",
      }),
    }));
    expect(mockAppMessageContentUpsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        contentType: "SOURCE",
        language: "en",
        text: ROYCE_WELCOME_MESSAGE,
      }),
    }));
    // Only the room's own selected languages get a translation row — not
    // every language the hardcoded welcome copy has canned text for. "en" is
    // excluded since it's already the SOURCE row.
    const translationCalls = mockAppMessageContentUpsert.mock.calls.filter(
      ([args]) => args?.create?.contentType === "TRANSLATION_FINAL",
    );
    expect(translationCalls).toHaveLength(1);
    expect(translationCalls.map(([args]) => args.create.language)).toEqual(["ko"]);
    expect(mockAppMessageContentUpsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        contentType: "TRANSLATION_FINAL",
        language: "ko",
        text: ROYCE_WELCOME_TRANSLATIONS.ko,
        provider: "hardcoded",
        model: "royce-welcome-v2",
      }),
    }));
    expect(mockMemberUpdateMany).toHaveBeenCalledWith({
      where: {
        channel: { sessionKey: "session-welcome" },
        userId: "new_user",
        leftAt: null,
      },
      data: { lastReadAt: null },
    });
    expect(mockNotifyConversationMessage).toHaveBeenCalledWith(
      "session-welcome",
      ["new_user", ROYCE_USER_ID],
    );
    expect(mockSendPushNotificationForConversationMessage).toHaveBeenCalledWith(expect.objectContaining({
      messageId: "message_welcome",
      senderUserId: ROYCE_USER_ID,
      sourceText: ROYCE_WELCOME_MESSAGE,
    }));
  });

  it("does nothing for Royce himself or when the configured account is unavailable", async () => {
    await ensureSignupWelcomeOnboarding({ userId: ROYCE_USER_ID });
    expect(mockUserFindFirst).not.toHaveBeenCalled();

    mockUserFindFirst.mockResolvedValueOnce(null);
    await ensureSignupWelcomeOnboarding({ userId: "new_user" });
    expect(mockUserFollowUpsert).not.toHaveBeenCalled();
    expect(mockFindOrCreateDirectConversation).not.toHaveBeenCalled();
  });

  it("skips translation rows when the new user has no languages beyond the source", async () => {
    mockUserFindUnique.mockResolvedValueOnce({ defaultConversationLanguages: ["en"] });

    await ensureSignupWelcomeOnboarding({ userId: "new_user", locale: "en" });

    const translationCalls = mockAppMessageContentUpsert.mock.calls.filter(
      ([args]) => args?.create?.contentType === "TRANSLATION_FINAL",
    );
    expect(translationCalls).toHaveLength(0);
  });

  it("ignores Royce's own account preference and only translates into the new user's own languages", async () => {
    // Royce's mutual-follow lookup uses findFirst; this asserts the welcome
    // message's own findUnique call is keyed on the new user, not Royce, so
    // a real Royce-standin account's own defaultConversationLanguages (e.g.
    // during local testing) never leaks into someone else's welcome message.
    mockUserFindUnique.mockResolvedValueOnce({ defaultConversationLanguages: ["ko", "en"] });

    await ensureSignupWelcomeOnboarding({ userId: "new_user", locale: "ko" });

    expect(mockUserFindUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "new_user" },
    }));
    const translationCalls = mockAppMessageContentUpsert.mock.calls.filter(
      ([args]) => args?.create?.contentType === "TRANSLATION_FINAL",
    );
    expect(translationCalls.map(([args]) => args.create.language)).toEqual(["ko"]);
  });

  it("retires a translation row for a language that's no longer selected (e.g. re-run after the user's language changes)", async () => {
    // Mirrors OAuth: the message already exists with a "ja" translation from
    // an earlier run; this run's target set no longer includes it.
    mockUserFindUnique.mockResolvedValueOnce({ defaultConversationLanguages: ["it", "en"] });

    await ensureSignupWelcomeOnboarding({ userId: "new_user", locale: "it" });

    expect(mockAppMessageContentUpdateMany).toHaveBeenCalledWith({
      where: {
        messageId: "message_welcome",
        contentType: "TRANSLATION_FINAL",
        isDeleted: false,
        language: { notIn: ["it"] },
      },
      data: { isDeleted: true },
    });
  });
});

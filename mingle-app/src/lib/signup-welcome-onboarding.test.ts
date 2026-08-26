import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockUserFindFirst,
  mockUserFollowUpsert,
  mockUserNotificationFindFirst,
  mockUserNotificationCreate,
  mockAppMessageUpsert,
  mockAppMessageContentUpsert,
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
  mockUserFollowUpsert: vi.fn(),
  mockUserNotificationFindFirst: vi.fn(),
  mockUserNotificationCreate: vi.fn(),
  mockAppMessageUpsert: vi.fn(),
  mockAppMessageContentUpsert: vi.fn(),
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
  appMessageContent: { upsert: mockAppMessageContentUpsert },
  appConversationChannelMember: { updateMany: mockMemberUpdateMany },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findFirst: mockUserFindFirst },
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
        selectedLanguages: ["ko", "en"],
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

  it("skips translation rows when the room has no selected languages beyond the source", async () => {
    mockFindOrCreateDirectConversation.mockResolvedValueOnce({
      conversation: {
        sessionKey: "session-welcome",
        selectedLanguages: ["en"],
      },
      reused: false,
    });

    await ensureSignupWelcomeOnboarding({ userId: "new_user", locale: "en" });

    const translationCalls = mockAppMessageContentUpsert.mock.calls.filter(
      ([args]) => args?.create?.contentType === "TRANSLATION_FINAL",
    );
    expect(translationCalls).toHaveLength(0);
  });
});

import { prisma } from "@/lib/prisma";
import {
  findOrCreateDirectConversation,
  listChannelMemberUserIdsBySessionKey,
  materializePendingConversationInvitees,
} from "@/lib/app-conversations";
import { deriveDefaultSttLanguagesForLocale, sanitizeSttLanguageSelection } from "@/lib/stt-languages";
import { ROYCE_WELCOME_TRANSLATIONS } from "@/lib/royce-welcome-translations";
import { notifyConversationMessage } from "@/server/conversation-realtime";
import { sendPushNotificationForConversationMessage, sendPushNotificationForUserNotification } from "@/server/push-notifications";

export const ROYCE_USER_ID = "cmsrqesom0000mx1hn62ce6r9";
export const ROYCE_WELCOME_MESSAGE = "Welcome! My name is Royce. I'm developer of Mingle. If you have any feedback or questions, feel free to message me anytime on Mingle. The cat in the photo is Somi, my cat.";

const ROYCE_WELCOME_CLIENT_MESSAGE_ID = "mingle-welcome-royce-v1";

type NewNotification = {
  id: string;
};

async function ensureMutualFollow(userId: string): Promise<NewNotification[]> {
  const notifications: NewNotification[] = [];

  await prisma.$transaction(async (tx) => {
    await tx.userFollow.upsert({
      where: {
        followerId_followingId: {
          followerId: userId,
          followingId: ROYCE_USER_ID,
        },
      },
      create: {
        followerId: userId,
        followingId: ROYCE_USER_ID,
      },
      update: {},
    });

    await tx.userFollow.upsert({
      where: {
        followerId_followingId: {
          followerId: ROYCE_USER_ID,
          followingId: userId,
        },
      },
      create: {
        followerId: ROYCE_USER_ID,
        followingId: userId,
      },
      update: {},
    });

    const notificationPairs = [
      { recipientId: ROYCE_USER_ID, actorId: userId },
      { recipientId: userId, actorId: ROYCE_USER_ID },
    ];

    for (const pair of notificationPairs) {
      const existing = await tx.userNotification.findFirst({
        where: {
          recipientId: pair.recipientId,
          actorId: pair.actorId,
          type: "follow",
        },
        select: { id: true },
      });
      if (existing) continue;

      notifications.push(await tx.userNotification.create({
        data: {
          ...pair,
          type: "follow",
        },
        select: { id: true },
      }));
    }
  });

  return notifications;
}

async function ensureRoyceWelcomeMessage(userId: string, locale?: string): Promise<void> {
  const conversationResult = await findOrCreateDirectConversation({
    userId,
    targetUserId: ROYCE_USER_ID,
    locale: locale || "en",
  });
  const sessionKey = conversationResult.conversation.sessionKey;

  // Translate only into the languages the NEW USER actually wants — read
  // their own persisted defaultConversationLanguages directly rather than
  // conversationResult.conversation.selectedLanguages: since Royce is a
  // pending invitee at this point, that room-level value is a UNION that
  // also pulls in Royce's own account's defaultConversationLanguages (see
  // resolveRoomLanguageUnion in app-conversations.ts), which would leak an
  // unrelated language into every new user's welcome message. "en" is
  // excluded since it's already written as the SOURCE row below.
  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { defaultConversationLanguages: true },
  });
  const ownSelectedLanguages = sanitizeSttLanguageSelection(
    targetUser?.defaultConversationLanguages,
    deriveDefaultSttLanguagesForLocale(locale),
  );
  const welcomeTranslationLanguages = ownSelectedLanguages.filter(
    (language): language is keyof typeof ROYCE_WELCOME_TRANSLATIONS => (
      language !== "en" && language in ROYCE_WELCOME_TRANSLATIONS
    ),
  );

  // A newly created direct room keeps the target as a pending invitee until
  // its first message. Materialize both accounts before inserting Royce's
  // server-authored welcome message so the recipient has a real read cursor.
  await materializePendingConversationInvitees(sessionKey);

  const message = await prisma.$transaction(async (tx) => {
    const createdMessage = await tx.appMessage.upsert({
      where: {
        sessionKey_clientMessageId: {
          sessionKey,
          clientMessageId: ROYCE_WELCOME_CLIENT_MESSAGE_ID,
        },
      },
      create: {
        userId: ROYCE_USER_ID,
        sessionKey,
        clientMessageId: ROYCE_WELCOME_CLIENT_MESSAGE_ID,
        isDeleted: false,
        sourceLanguage: "en",
        metadata: {
          source: "signup_welcome",
          welcomeVersion: 2,
          translationLanguages: welcomeTranslationLanguages,
        },
      },
      update: {
        userId: ROYCE_USER_ID,
        isDeleted: false,
        metadata: {
          source: "signup_welcome",
          welcomeVersion: 2,
          translationLanguages: welcomeTranslationLanguages,
        },
      },
      select: { id: true },
    });

    await tx.appMessageContent.upsert({
      where: {
        messageId_contentType_language: {
          messageId: createdMessage.id,
          contentType: "SOURCE",
          language: "en",
        },
      },
      create: {
        messageId: createdMessage.id,
        contentType: "SOURCE",
        language: "en",
        isDeleted: false,
        text: ROYCE_WELCOME_MESSAGE,
      },
      update: {
        isDeleted: false,
        text: ROYCE_WELCOME_MESSAGE,
      },
    });

    for (const language of welcomeTranslationLanguages) {
      const translatedText = ROYCE_WELCOME_TRANSLATIONS[language];
      await tx.appMessageContent.upsert({
        where: {
          messageId_contentType_language: {
            messageId: createdMessage.id,
            contentType: "TRANSLATION_FINAL",
            language,
          },
        },
        create: {
          messageId: createdMessage.id,
          contentType: "TRANSLATION_FINAL",
          language,
          isDeleted: false,
          text: translatedText,
          provider: "hardcoded",
          model: "royce-welcome-v2",
        },
        update: {
          isDeleted: false,
          text: translatedText,
          provider: "hardcoded",
          model: "royce-welcome-v2",
        },
      });
    }

    // This runs again whenever the user's own language changes after the
    // welcome message already exists — e.g. OAuth signup writes it once with
    // a generic locale, then the post-login profile sync (see
    // /api/profile's PATCH handler) calls back in with the real one. Retire
    // any translation row left over from an earlier run that's no longer in
    // the current target set, so a stale language doesn't linger forever
    // (upserting the current set alone never removes what it doesn't cover).
    await tx.appMessageContent.updateMany({
      where: {
        messageId: createdMessage.id,
        contentType: "TRANSLATION_FINAL",
        isDeleted: false,
        language: { notIn: welcomeTranslationLanguages },
      },
      data: { isDeleted: true },
    });

    // The account is new and this message must be unread when its first
    // conversation list is hydrated. This is idempotent and does not create
    // another message because the deterministic clientMessageId is unique per
    // conversation.
    await tx.appConversationChannelMember.updateMany({
      where: {
        channel: { sessionKey },
        userId,
        leftAt: null,
      },
      data: { lastReadAt: null },
    });

    return createdMessage;
  });

  const memberUserIds = await listChannelMemberUserIdsBySessionKey(sessionKey);
  await notifyConversationMessage(sessionKey, memberUserIds);
  await sendPushNotificationForConversationMessage({
    messageId: message.id,
    sessionKey,
    sourceText: ROYCE_WELCOME_MESSAGE,
    senderUserId: ROYCE_USER_ID,
    memberUserIds,
  });
}

export async function ensureSignupWelcomeOnboarding(args: {
  userId: string;
  locale?: string | null;
}): Promise<void> {
  const userId = args.userId.trim();
  if (!userId || userId === ROYCE_USER_ID) return;

  try {
    const royce = await prisma.user.findFirst({
      where: {
        id: ROYCE_USER_ID,
        isActive: true,
        isDeleted: false,
      },
      select: { id: true },
    });
    if (!royce) return;

    const newNotifications = await ensureMutualFollow(userId);
    for (const notification of newNotifications) {
      try {
        await sendPushNotificationForUserNotification(notification.id);
      } catch (error) {
        console.error("[signup-welcome] follow push failed", error);
      }
    }
  } catch (error) {
    console.error("[signup-welcome] mutual follow failed", error);
  }

  try {
    await ensureRoyceWelcomeMessage(userId, args.locale ?? undefined);
  } catch (error) {
    console.error("[signup-welcome] welcome message failed", error);
  }
}

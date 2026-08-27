import { prisma } from "@/lib/prisma";
import {
  findOrCreateDirectConversationSession,
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
const ROYCE_WELCOME_RETRY_DELAYS_MS = [0, 250, 1_000] as const;

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
  let sessionKey = "";
  let messageId = "";
  let lastError: unknown;

  for (let attempt = 0; attempt < ROYCE_WELCOME_RETRY_DELAYS_MS.length; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, ROYCE_WELCOME_RETRY_DELAYS_MS[attempt]));
    }

    try {
      // Signup only needs the durable session key. Full preview serialization
      // performs profile/message reads that are unrelated to writing the
      // welcome message and can fail after a newly-created room is committed.
      const conversationResult = await findOrCreateDirectConversationSession({
        userId,
        targetUserId: ROYCE_USER_ID,
        locale: locale || "en",
        preferredSessionKey: `mingle-welcome-royce-${userId}`,
      });
      sessionKey = conversationResult.sessionKey;

      // Translate only into the languages the NEW USER actually wants — read
      // their own persisted defaultConversationLanguages directly rather than
      // the room union, which also includes Royce's preferences.
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

      // A newly created direct room keeps Royce as a pending invitee until
      // the first message. Materialize both accounts before inserting the
      // server-authored welcome message so the recipient has a real cursor.
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

        // Re-running onboarding after a language change must retire stale
        // rows left by the earlier run.
        await tx.appMessageContent.updateMany({
          where: {
            messageId: createdMessage.id,
            contentType: "TRANSLATION_FINAL",
            isDeleted: false,
            language: { notIn: welcomeTranslationLanguages },
          },
          data: { isDeleted: true },
        });

        // Keep the welcome unread for the new recipient. The deterministic
        // clientMessageId makes the whole operation idempotent.
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

      messageId = message.id;
      break;
    } catch (error) {
      lastError = error;
      if (attempt === ROYCE_WELCOME_RETRY_DELAYS_MS.length - 1) {
        throw error;
      }
      console.warn("[signup-welcome] database attempt failed; retrying", {
        attempt: attempt + 1,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (!sessionKey || !messageId) {
    throw lastError instanceof Error ? lastError : new Error("signup_welcome_message_failed");
  }

  // Realtime and push are latency enhancements. They must never turn a
  // successfully committed welcome message into a failed onboarding attempt.
  let memberUserIds: string[] = [];
  try {
    memberUserIds = await listChannelMemberUserIdsBySessionKey(sessionKey);
    await notifyConversationMessage(sessionKey, memberUserIds);
  } catch (error) {
    console.warn("[signup-welcome] realtime notification failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    await sendPushNotificationForConversationMessage({
      messageId,
      sessionKey,
      sourceText: ROYCE_WELCOME_MESSAGE,
      senderUserId: ROYCE_USER_ID,
      memberUserIds,
    });
  } catch (error) {
    console.warn("[signup-welcome] welcome push failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
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

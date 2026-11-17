import { prisma } from "@/lib/prisma";
import {
  findOrCreateDirectConversationSession,
  listChannelMemberUserIdsBySessionKey,
  materializePendingConversationInvitees,
} from "@/lib/app-conversations";
import { deriveDefaultSttLanguagesForLocale, sanitizeSttLanguageSelection } from "@/lib/stt-languages";
import { ROYCE_WELCOME_TRANSLATIONS } from "@/lib/royce-welcome-translations";
import { HAMZZI_WELCOME_MESSAGE, HAMZZI_WELCOME_TRANSLATIONS } from "@/lib/hamzzi-welcome-translations";
import { ensureHamzziAccount, HAMZZI_USER_ID } from "@/lib/hamzzi";
import { notifyConversationMessage } from "@/server/conversation-realtime";
import { sendPushNotificationForConversationMessage, sendPushNotificationForUserNotification } from "@/server/push-notifications";

export const ROYCE_USER_ID = "cmsrqesom0000mx1hn62ce6r9";
export const ROYCE_WELCOME_MESSAGE = "Welcome! My name is Royce. I'm developer of HashChat. If you have any feedback or questions, feel free to message me anytime on HashChat. The cat in the photo is Somi, my cat.";

const WELCOME_RETRY_DELAYS_MS = [0, 250, 1_000] as const;

/** One account's welcome DM: who sends it, its fixed ids and its text. */
type WelcomeSpec = {
  senderUserId: string;
  clientMessageId: string;
  /** Prefix of the deterministic room key: `${prefix}${userId}`. */
  sessionKeyPrefix: string;
  sourceText: string;
  translations: Record<string, string>;
  /** Stored as the translation model of the hardcoded copies. */
  translationModel: string;
};

const ROYCE_WELCOME: WelcomeSpec = {
  senderUserId: ROYCE_USER_ID,
  clientMessageId: "mingle-welcome-royce-v1",
  sessionKeyPrefix: "mingle-welcome-royce-",
  sourceText: ROYCE_WELCOME_MESSAGE,
  translations: ROYCE_WELCOME_TRANSLATIONS,
  translationModel: "royce-welcome-v2",
};

const HAMZZI_WELCOME: WelcomeSpec = {
  senderUserId: HAMZZI_USER_ID,
  clientMessageId: "mingle-welcome-hamzzi-v1",
  sessionKeyPrefix: "mingle-welcome-hamzzi-",
  sourceText: HAMZZI_WELCOME_MESSAGE,
  translations: HAMZZI_WELCOME_TRANSLATIONS,
  translationModel: "hamzzi-welcome-v1",
};

type NewNotification = {
  id: string;
};

async function ensureMutualFollow(
  userId: string,
  accountUserId: string,
  options: { notify: boolean },
): Promise<NewNotification[]> {
  const notifications: NewNotification[] = [];

  await prisma.$transaction(async (tx) => {
    await tx.userFollow.upsert({
      where: {
        followerId_followingId: {
          followerId: userId,
          followingId: accountUserId,
        },
      },
      create: {
        followerId: userId,
        followingId: accountUserId,
      },
      update: {},
    });

    await tx.userFollow.upsert({
      where: {
        followerId_followingId: {
          followerId: accountUserId,
          followingId: userId,
        },
      },
      create: {
        followerId: accountUserId,
        followingId: userId,
      },
      update: {},
    });

    if (!options.notify) return;
    const notificationPairs = [
      { recipientId: accountUserId, actorId: userId },
      { recipientId: userId, actorId: accountUserId },
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

async function ensureWelcomeMessage(
  spec: WelcomeSpec,
  userId: string,
  locale: string | undefined,
  options: { push: boolean },
): Promise<void> {
  let sessionKey = "";
  let messageId = "";
  let lastError: unknown;

  for (let attempt = 0; attempt < WELCOME_RETRY_DELAYS_MS.length; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, WELCOME_RETRY_DELAYS_MS[attempt]));
    }

    try {
      // Signup only needs the durable session key. Full preview serialization
      // performs profile/message reads that are unrelated to writing the
      // welcome message and can fail after a newly-created room is committed.
      const conversationResult = await findOrCreateDirectConversationSession({
        userId,
        targetUserId: spec.senderUserId,
        locale: locale || "en",
        preferredSessionKey: `${spec.sessionKeyPrefix}${userId}`,
      });
      sessionKey = conversationResult.sessionKey;

      // Translate only into the languages the NEW USER actually wants — read
      // their own persisted defaultConversationLanguages directly rather than
      // the room union, which also includes the sender's preferences.
      const targetUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { defaultConversationLanguages: true },
      });
      const ownSelectedLanguages = sanitizeSttLanguageSelection(
        targetUser?.defaultConversationLanguages,
        deriveDefaultSttLanguagesForLocale(locale),
      );
      const welcomeTranslationLanguages = ownSelectedLanguages.filter(
        (language) => language !== "en" && Object.hasOwn(spec.translations, language),
      );

      // A newly created direct room keeps the sender as a pending invitee until
      // the first message. Materialize both accounts before inserting the
      // server-authored welcome message so the recipient has a real cursor.
      await materializePendingConversationInvitees(sessionKey);

      const message = await prisma.$transaction(async (tx) => {
        const createdMessage = await tx.appMessage.upsert({
          where: {
            sessionKey_clientMessageId: {
              sessionKey,
              clientMessageId: spec.clientMessageId,
            },
          },
          create: {
            userId: spec.senderUserId,
            sessionKey,
            clientMessageId: spec.clientMessageId,
            isDeleted: false,
            sourceLanguage: "en",
            metadata: {
              source: "signup_welcome",
              welcomeVersion: 2,
              translationLanguages: welcomeTranslationLanguages,
            },
          },
          update: {
            userId: spec.senderUserId,
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
            text: spec.sourceText,
          },
          update: {
            isDeleted: false,
            text: spec.sourceText,
          },
        });

        for (const language of welcomeTranslationLanguages) {
          const translatedText = spec.translations[language];
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
              model: spec.translationModel,
            },
            update: {
              isDeleted: false,
              text: translatedText,
              provider: "hardcoded",
              model: spec.translationModel,
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
      if (attempt === WELCOME_RETRY_DELAYS_MS.length - 1) {
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

  if (!options.push) return;
  try {
    await sendPushNotificationForConversationMessage({
      messageId,
      sessionKey,
      sourceText: spec.sourceText,
      senderUserId: spec.senderUserId,
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
  if (!userId || userId === ROYCE_USER_ID || userId === HAMZZI_USER_ID) return;

  await ensureRoyceWelcome(userId, args.locale ?? undefined);
  await ensureHamzziWelcome({ userId, locale: args.locale ?? undefined, push: true });
}

async function ensureRoyceWelcome(userId: string, locale: string | undefined): Promise<void> {
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

    const newNotifications = await ensureMutualFollow(userId, ROYCE_USER_ID, { notify: true });
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
    await ensureWelcomeMessage(ROYCE_WELCOME, userId, locale, { push: true });
  } catch (error) {
    console.error("[signup-welcome] welcome message failed", error);
  }
}

/**
 * Hamzzi's mutual follow (without follow notifications) and welcome DM.
 * Idempotent; also used to backfill existing users (with `push: false`).
 * Returns false when Hamzzi is turned off or the welcome could not be written.
 */
export async function ensureHamzziWelcome(args: {
  userId: string;
  locale?: string;
  push: boolean;
}): Promise<boolean> {
  const userId = args.userId.trim();
  if (!userId || userId === HAMZZI_USER_ID) return false;
  try {
    const hamzzi = await ensureHamzziAccount();
    if (!hamzzi) return false;
    await ensureMutualFollow(userId, HAMZZI_USER_ID, { notify: false });
  } catch (error) {
    console.error("[signup-welcome] hamzzi follow failed", error);
    return false;
  }

  try {
    await ensureWelcomeMessage(HAMZZI_WELCOME, userId, args.locale, { push: args.push });
    return true;
  } catch (error) {
    console.error("[signup-welcome] hamzzi welcome message failed", error);
    return false;
  }
}

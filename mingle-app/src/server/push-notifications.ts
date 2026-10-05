import { createPrivateKey, createSign } from "node:crypto";
import { connect } from "node:http2";
import { prisma } from "@/lib/prisma";
import { feedHref } from "@/lib/feed-routes";
import { resolveAccountBadge, withAccountBadgeLabel } from "@/lib/account-badge";
import { resolveLegalDocumentLocale, resolveSupportedLocaleTag, type LegalDocumentLocale } from "@/i18n/config";
import { resolvePushNotificationCopy } from "@/i18n/notification-copy";
import { resolveOperatorInboxPushCopy } from "@/server/operator-inbox/push-copy";

type PushPlatform = "ios" | "android";

type PushTarget = {
  id: string;
  platform: string;
  token: string;
  environment: string;
};

export type PushMessage = {
  notificationId: string;
  /**
   * conversation_message | follow | comment | comment_reply |
   * operator_inbox_message (staff alert, copy from
   * `resolveOperatorInboxPushCopy`). Any other type gets a generic copy.
   */
  type: string;
  actorId: string;
  /** Actor name as shown, already carrying its badge (see `withAccountBadgeLabel`). */
  actorLabel: string;
  recipientLanguage: string;
  messagePreview?: string;
  sessionKey?: string;
  conversationId?: string;
  /** In-app destination the tap should open (e.g. feedHref with post/comment). */
  navigationUrl?: string;
};

type PushSendResult = {
  invalidToken: boolean;
};

type ApnsConfig = {
  teamId: string;
  keyId: string;
  bundleId: string;
  privateKey: string;
  defaultEnvironment: "sandbox" | "production";
};

type FcmConfig = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
};

type CachedFcmAccessToken = {
  accessToken: string;
  expiresAtMs: number;
};

const APNS_REQUEST_TIMEOUT_MS = 8_000;
const FCM_REQUEST_TIMEOUT_MS = 8_000;
const APNS_PRODUCTION_HOST = "api.push.apple.com";
const APNS_SANDBOX_HOST = "api.sandbox.push.apple.com";
const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const FCM_TOKEN_AUDIENCE = "https://oauth2.googleapis.com/token";

let cachedFcmAccessToken: CachedFcmAccessToken | null = null;

function normalizeEnvValue(value: string | undefined): string {
  return value?.trim() ?? "";
}

function resolvePrivateKey(value: string | undefined): string {
  return normalizeEnvValue(value).replace(/\\n/g, "\n");
}

function base64UrlEncode(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function signJwt(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  privateKey: string,
  algorithm: "ES256" | "RS256" = "RS256",
): string {
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signer = createSign(algorithm === "ES256" ? "SHA256" : "RSA-SHA256");
  signer.update(`${encodedHeader}.${encodedPayload}`);
  const key = createPrivateKey(privateKey);
  const signature = algorithm === "ES256"
    ? signer.sign({ key, dsaEncoding: "ieee-p1363" })
    : signer.sign(key);
  return `${encodedHeader}.${encodedPayload}.${base64UrlEncode(signature)}`;
}

function readApnsConfig(): ApnsConfig | null {
  const teamId = normalizeEnvValue(process.env.APNS_TEAM_ID);
  const keyId = normalizeEnvValue(process.env.APNS_KEY_ID);
  const bundleId = normalizeEnvValue(process.env.APNS_BUNDLE_ID);
  const privateKey = resolvePrivateKey(process.env.APNS_PRIVATE_KEY);
  if (!teamId || !keyId || !bundleId || !privateKey) return null;

  return {
    teamId,
    keyId,
    bundleId,
    privateKey,
    defaultEnvironment: process.env.APNS_ENVIRONMENT?.trim().toLowerCase() === "sandbox"
      ? "sandbox"
      : "production",
  };
}

function readFcmConfig(): FcmConfig | null {
  const projectId = normalizeEnvValue(process.env.FCM_PROJECT_ID);
  const clientEmail = normalizeEnvValue(process.env.FCM_CLIENT_EMAIL);
  const privateKey = resolvePrivateKey(process.env.FCM_PRIVATE_KEY);
  if (!projectId || !clientEmail || !privateKey) return null;
  return { projectId, clientEmail, privateKey };
}

function resolvePushPlatform(value: string): PushPlatform | null {
  const normalized = value.trim().toLowerCase();
  return normalized === "ios" || normalized === "android" ? normalized : null;
}

// `conversation_message` title and the separator between the sender label and
// the preview, for all 15 primary UI languages.
const CONVERSATION_MESSAGE_PUSH_COPY: Record<LegalDocumentLocale, { title: string; separator: string }> = {
  ko: { title: "새 메시지", separator: "님: " },
  en: { title: "New message", separator: ": " },
  ja: { title: "新しいメッセージ", separator: "さん: " },
  "zh-CN": { title: "新消息", separator: "：" },
  "zh-TW": { title: "新訊息", separator: "：" },
  fr: { title: "Nouveau message", separator: " : " },
  de: { title: "Neue Nachricht", separator: ": " },
  es: { title: "Nuevo mensaje", separator: ": " },
  pt: { title: "Nova mensagem", separator: ": " },
  it: { title: "Nuovo messaggio", separator: ": " },
  ru: { title: "Новое сообщение", separator: ": " },
  ar: { title: "رسالة جديدة", separator: ": " },
  hi: { title: "नया संदेश", separator: ": " },
  th: { title: "ข้อความใหม่", separator: ": " },
  vi: { title: "Tin nhắn mới", separator: ": " },
};

const FEEDBACK_REPLY_PUSH_TITLES: Record<string, string> = {
  ko: "피드백에 답변이 도착했어요",
  en: "Reply to your feedback",
  ja: "フィードバックに返信が届きました",
  "zh-cn": "你的反馈有新回复",
  "zh-tw": "你的意見回饋有新回覆",
  es: "Respuesta a tus comentarios",
  fr: "Réponse à votre commentaire",
  de: "Antwort auf Ihr Feedback",
  pt: "Resposta ao seu feedback",
  it: "Risposta al tuo feedback",
  ru: "Ответ на ваш отзыв",
  ar: "رد على ملاحظاتك",
  hi: "आपके फ़ीडबैक का जवाब आया है",
  th: "มีคำตอบสำหรับความคิดเห็นของคุณ",
  vi: "Phản hồi cho góp ý của bạn",
};

/** Title and body shown on the device, in the recipient's language (unknown -> English). */
export function resolvePushCopy(message: PushMessage): { title: string; body: string } {
  const label = message.actorLabel || "Someone";
  if (message.type === "feedback_reply") {
    const language = message.recipientLanguage.trim().toLowerCase();
    const preview = (message.messagePreview || "").replace(/\s+/g, " ").trim() || "…";
    return {
      title: FEEDBACK_REPLY_PUSH_TITLES[language] ?? FEEDBACK_REPLY_PUSH_TITLES.en,
      body: preview,
    };
  }
  if (message.type === "conversation_message") {
    const preview = (message.messagePreview || "").replace(/\s+/g, " ").trim() || "…";
    const locale = resolveLegalDocumentLocale(resolveSupportedLocaleTag(message.recipientLanguage.trim()) ?? "en");
    const copy = CONVERSATION_MESSAGE_PUSH_COPY[locale];
    return { title: copy.title, body: `${label}${copy.separator}${preview}` };
  }
  if (message.type === "operator_inbox_message") {
    return resolveOperatorInboxPushCopy({
      recipientLanguage: message.recipientLanguage,
      actorLabel: label,
      messagePreview: message.messagePreview,
    });
  }
  if (message.type === "follow" || message.type === "comment" || message.type === "comment_reply") {
    // All 15 primary UI languages; an unknown language falls back to English.
    return resolvePushNotificationCopy(message.recipientLanguage, message.type, label);
  }

  return { title: "Mingle", body: "You have a new notification." };
}

function createPushData(message: PushMessage): Record<string, string> {
  const data: Record<string, string> = {
    type: message.type,
    notificationId: message.notificationId,
  };
  if (message.actorId) data.actorId = message.actorId;
  if (message.sessionKey) data.sessionKey = message.sessionKey;
  if (message.conversationId) data.conversationId = message.conversationId;
  if (message.navigationUrl) data.url = message.navigationUrl;
  return data;
}

async function sendApnsNotification(
  target: PushTarget,
  message: PushMessage,
  config: ApnsConfig,
): Promise<PushSendResult> {
  const environment = target.environment === "sandbox" ? "sandbox" : config.defaultEnvironment;
  const host = environment === "sandbox" ? APNS_SANDBOX_HOST : APNS_PRODUCTION_HOST;
  const token = target.token.replace(/[^a-f0-9]/gi, "");
  if (!token) return { invalidToken: true };

  const now = Math.floor(Date.now() / 1000);
  const authorization = signJwt(
    { alg: "ES256", kid: config.keyId },
    { iss: config.teamId, iat: now },
    config.privateKey,
    "ES256",
  );
  const copy = resolvePushCopy(message);
  const payload = JSON.stringify({
    aps: {
      alert: { title: copy.title, body: copy.body },
      sound: "default",
      badge: 1,
    },
    type: message.type,
    notificationId: message.notificationId,
    ...(message.actorId ? { actorId: message.actorId } : {}),
    messageId: message.notificationId,
    ...(message.sessionKey ? { sessionKey: message.sessionKey } : {}),
    ...(message.conversationId ? { conversationId: message.conversationId } : {}),
    ...(message.navigationUrl ? { url: message.navigationUrl } : {}),
  });

  return new Promise((resolve) => {
    let settled = false;
    let responseBody = "";
    let responseStatus = 0;
    const client = connect(`https://${host}`);

    const finish = (result: PushSendResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      client.close();
      resolve(result);
    };
    const timeoutId = setTimeout(() => finish({ invalidToken: false }), APNS_REQUEST_TIMEOUT_MS);

    client.once("error", () => finish({ invalidToken: false }));
    client.once("connect", () => {
      const request = client.request({
        ":method": "POST",
        ":path": `/3/device/${token}`,
        authorization: `bearer ${authorization}`,
        "apns-topic": config.bundleId,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "content-type": "application/json",
      });

      request.setEncoding("utf8");
      request.on("response", (headers) => {
        responseStatus = Number(headers[":status"] ?? 0);
      });
      request.on("data", (chunk: string) => {
        responseBody += chunk;
      });
      request.once("error", () => finish({ invalidToken: false }));
      request.once("end", () => {
        let reason = "";
        try {
          const parsed = JSON.parse(responseBody) as { reason?: unknown };
          reason = typeof parsed.reason === "string" ? parsed.reason : "";
        } catch {
          // APNs can return an empty body for successful requests.
        }
        finish({
          invalidToken: responseStatus === 410 || reason === "Unregistered" || reason === "BadDeviceToken",
        });
      });
      request.end(payload);
    });
  });
}

async function getFcmAccessToken(config: FcmConfig): Promise<string> {
  if (cachedFcmAccessToken && cachedFcmAccessToken.expiresAtMs > Date.now() + 60_000) {
    return cachedFcmAccessToken.accessToken;
  }

  const now = Math.floor(Date.now() / 1000);
  const assertion = signJwt(
    { alg: "RS256", typ: "JWT" },
    {
      iss: config.clientEmail,
      scope: FCM_SCOPE,
      aud: FCM_TOKEN_AUDIENCE,
      iat: now,
      exp: now + 3_600,
    },
    config.privateKey,
  );
  const response = await fetch(FCM_TOKEN_AUDIENCE, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    signal: AbortSignal.timeout(FCM_REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`fcm_oauth_${response.status}`);
  }

  const payload = await response.json() as { access_token?: unknown; expires_in?: unknown };
  const accessToken = typeof payload.access_token === "string" ? payload.access_token : "";
  if (!accessToken) throw new Error("fcm_access_token_missing");
  const expiresIn = typeof payload.expires_in === "number" ? payload.expires_in : 3_600;
  cachedFcmAccessToken = {
    accessToken,
    expiresAtMs: Date.now() + Math.max(60, expiresIn) * 1_000,
  };
  return accessToken;
}

async function sendFcmNotification(
  target: PushTarget,
  message: PushMessage,
  config: FcmConfig,
): Promise<PushSendResult> {
  const accessToken = await getFcmAccessToken(config);
  const copy = resolvePushCopy(message);
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(config.projectId)}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token: target.token,
          notification: copy,
          data: createPushData(message),
          android: {
            priority: "HIGH",
            notification: {
              channel_id: "mingle_notifications",
              icon: "mingle_notification",
              sound: "default",
              click_action: "MINGLE_NOTIFICATION_OPEN",
            },
          },
        },
      }),
      signal: AbortSignal.timeout(FCM_REQUEST_TIMEOUT_MS),
    },
  );

  if (response.ok) return { invalidToken: false };
  const responseText = await response.text();
  return {
    invalidToken: response.status === 404
      || responseText.includes("UNREGISTERED")
      || responseText.includes("INVALID_ARGUMENT"),
  };
}

async function sendPushToTarget(
  target: PushTarget,
  message: PushMessage,
  apnsConfig: ApnsConfig | null,
  fcmConfig: FcmConfig | null,
): Promise<PushSendResult> {
  const platform = resolvePushPlatform(target.platform);
  if (platform === "ios" && apnsConfig) {
    return sendApnsNotification(target, message, apnsConfig);
  }
  if (platform === "android" && fcmConfig) {
    return sendFcmNotification(target, message, fcmConfig);
  }
  return { invalidToken: false };
}

const PUSH_TARGET_SELECT = {
  id: true,
  platform: true,
  token: true,
  environment: true,
} as const;

type PushDelivery = { tokenId: string; promise: Promise<PushSendResult> };

function resolveRecipientLanguage(user: { pageLanguage: string | null; language: string | null }): string {
  return user.pageLanguage?.trim() || user.language?.trim() || "en";
}

/** Waits for every delivery, then deletes the tokens APNs/FCM reported as dead. */
async function settlePushDeliveries(deliveries: PushDelivery[]): Promise<void> {
  const results = await Promise.allSettled(deliveries.map((delivery) => delivery.promise));
  const invalidTokenIds = results.flatMap((result, index) => (
    result.status === "fulfilled" && result.value.invalidToken
      ? [deliveries[index].tokenId]
      : []
  ));
  if (invalidTokenIds.length > 0) {
    await prisma.userPushToken.deleteMany({ where: { id: { in: invalidTokenIds } } });
  }
}

/** One recipient, as `sendPushToUsers` hands it to `build`. */
export type PushRecipient = {
  userId: string;
  /** pageLanguage, else language, else "en": the rule every push uses. */
  language: string;
};

/**
 * Pushes to every registered device of each user in `userIds` (deduplicated).
 * `build` returns the message for one recipient, or null to skip them; it only
 * runs for users that have a device. Tokens APNs/FCM report as dead are
 * deleted. A failing device never rejects the call; a failing user lookup or
 * token cleanup does, so callers that must not fail wrap it.
 */
export async function sendPushToUsers(
  userIds: string[],
  build: (recipient: PushRecipient) => PushMessage | null | Promise<PushMessage | null>,
): Promise<void> {
  const apnsConfig = readApnsConfig();
  const fcmConfig = readFcmConfig();
  if (!apnsConfig && !fcmConfig) return;

  const ids = [...new Set(userIds.filter((userId) => typeof userId === "string" && userId.trim()))];
  if (ids.length === 0) return;

  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, language: true, pageLanguage: true, pushTokens: { select: PUSH_TARGET_SELECT } },
  });
  const planned: Array<{ target: PushTarget; message: PushMessage }> = [];
  for (const user of users) {
    if (user.pushTokens.length === 0) continue;
    const message = await build({ userId: user.id, language: resolveRecipientLanguage(user) });
    if (!message) continue;
    for (const target of user.pushTokens as PushTarget[]) planned.push({ target, message });
  }
  // Start every send only after all messages are built, so no delivery can
  // reject before settlePushDeliveries is observing it.
  await settlePushDeliveries(planned.map(({ target, message }) => ({
    tokenId: target.id,
    promise: sendPushToTarget(target, message, apnsConfig, fcmConfig),
  })));
}

export async function sendPushNotificationForUserNotification(notificationId: string): Promise<void> {
  const apnsConfig = readApnsConfig();
  const fcmConfig = readFcmConfig();
  if (!apnsConfig && !fcmConfig) return;

  const notification = await prisma.userNotification.findUnique({
    where: { id: notificationId },
    select: {
      id: true,
      type: true,
      postId: true,
      commentId: true,
      recipient: {
        select: {
          language: true,
          pageLanguage: true,
          pushTokens: { select: PUSH_TARGET_SELECT },
        },
      },
      actor: {
        select: {
          id: true,
          handle: true,
          name: true,
          isOfficial: true,
          isOperator: true,
        },
      },
    },
  });
  if (!notification) return;

  const recipientLanguage = resolveRecipientLanguage(notification.recipient);
  const recipientLocale = resolveSupportedLocaleTag(recipientLanguage) ?? "en";
  const navigationUrl = notification.postId
    ? feedHref(recipientLocale, {
        postId: notification.postId,
        commentId: notification.commentId,
      })
    : notification.type === "follow"
      // Follow taps open the new follower's profile (same path the web push-tap
      // receiver resolves for `/{locale}/users/{id}`).
      ? `/${recipientLocale}/users/${encodeURIComponent(notification.actor.id)}`
      : undefined;

  const actorName = notification.actor.name?.trim() || `@${notification.actor.handle}`;
  const message: PushMessage = {
    notificationId: notification.id,
    type: notification.type,
    actorId: notification.actor.id,
    // An operator / official actor keeps its badge on the lock screen too.
    actorLabel: withAccountBadgeLabel(actorName, resolveAccountBadge(notification.actor), recipientLanguage),
    recipientLanguage,
    ...(navigationUrl ? { navigationUrl } : {}),
  };
  const targets = notification.recipient.pushTokens as PushTarget[];
  await settlePushDeliveries(targets.map((target) => ({
    tokenId: target.id,
    promise: sendPushToTarget(target, message, apnsConfig, fcmConfig),
  })));
}

// Message pushes deliberately do not create UserNotification rows. The
// in-app notification panel is reserved for non-message events such as
// follows; conversation unread state is tracked by each membership cursor.
export async function sendPushNotificationForConversationMessage(args: {
  messageId: string;
  sessionKey: string;
  sourceText: string;
  senderUserId: string;
  memberUserIds: string[];
}): Promise<void> {
  const apnsConfig = readApnsConfig();
  const fcmConfig = readFcmConfig();
  if (!apnsConfig && !fcmConfig) return;

  const recipientUserIds = [...new Set(
    args.memberUserIds.filter((userId) => userId.trim() && userId !== args.senderUserId),
  )];
  if (recipientUserIds.length === 0) return;

  // The web conversation room is `/{locale}/conversations?conversation={channelId}`.
  // Message pushes only know the session key, so resolve the channel id once here
  // and let each recipient's locale build its own room URL below. Without this
  // the native tap handler has no room to open (a message push carries no url).
  const channel = await prisma.appConversationChannel.findUnique({
    where: { sessionKey: args.sessionKey },
    select: { id: true },
  });
  const channelId = channel?.id ?? "";

  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set([args.senderUserId, ...recipientUserIds])] } },
    select: {
      id: true,
      name: true,
      handle: true,
      isOfficial: true,
      isOperator: true,
      language: true,
      pageLanguage: true,
      pushTokens: { select: PUSH_TARGET_SELECT },
    },
  });
  const sender = users.find((user) => user.id === args.senderUserId);
  const senderName = sender?.name?.trim() || (sender?.handle ? `@${sender.handle}` : "Someone");
  const senderBadge = resolveAccountBadge(sender);
  const messagePreview = args.sourceText.replace(/\s+/g, " ").trim().slice(0, 240);
  if (!messagePreview) return;

  const targetEntries: PushDelivery[] = [];
  for (const recipientUserId of recipientUserIds) {
    const recipient = users.find((user) => user.id === recipientUserId);
    if (!recipient) continue;
    const recipientLanguage = resolveRecipientLanguage(recipient);
    // Build the room URL in the recipient's own locale, matching the web route
    // `/{locale}/conversations?conversation={channelId}`. Falls back to the raw
    // conversationId (the native tap handler rebuilds the room path from it).
    const roomLocale = resolveSupportedLocaleTag(recipientLanguage) ?? "en";
    const navigationUrl = channelId
      ? `/${roomLocale}/conversations?conversation=${encodeURIComponent(channelId)}`
      : undefined;
    const message: PushMessage = {
      notificationId: args.messageId,
      type: "conversation_message",
      actorId: args.senderUserId,
      // An operator sender is labeled in each recipient's own language:
      // "Mina (운영 계정)" / "Mina (Run by Mingle)".
      actorLabel: withAccountBadgeLabel(senderName, senderBadge, recipientLanguage),
      recipientLanguage,
      messagePreview,
      sessionKey: args.sessionKey,
      ...(channelId ? { conversationId: channelId } : {}),
      ...(navigationUrl ? { navigationUrl } : {}),
    };
    for (const target of recipient.pushTokens as PushTarget[]) {
      targetEntries.push({
        tokenId: target.id,
        promise: sendPushToTarget(target, message, apnsConfig, fcmConfig),
      });
    }
  }

  await settlePushDeliveries(targetEntries);
}

// Team replies have no actor user, so like message pushes they do not create
// UserNotification rows. Anonymous feedback (no account) cannot be pushed to.
export async function sendPushNotificationForFeedbackReply(args: {
  replyId: string;
  recipientUserId: string;
  replyText: string;
  feedbackLocale?: string | null;
}): Promise<void> {
  const apnsConfig = readApnsConfig();
  const fcmConfig = readFcmConfig();
  if (!apnsConfig && !fcmConfig) return;

  const messagePreview = args.replyText.replace(/\s+/g, " ").trim().slice(0, 240);
  if (!messagePreview) return;

  const recipient = await prisma.user.findUnique({
    where: { id: args.recipientUserId },
    select: {
      language: true,
      pageLanguage: true,
      pushTokens: {
        select: {
          id: true,
          platform: true,
          token: true,
          environment: true,
        },
      },
    },
  });
  if (!recipient) return;

  const message: PushMessage = {
    notificationId: args.replyId,
    type: "feedback_reply",
    actorId: "",
    actorLabel: "Mingle",
    recipientLanguage: recipient.pageLanguage?.trim()
      || recipient.language?.trim()
      || args.feedbackLocale?.trim()
      || "en",
    messagePreview,
  };
  const targets = recipient.pushTokens as PushTarget[];
  const results = await Promise.allSettled(
    targets.map((target) => sendPushToTarget(target, message, apnsConfig, fcmConfig)),
  );
  const invalidTokenIds = results.flatMap((result, index) => (
    result.status === "fulfilled" && result.value.invalidToken
      ? [targets[index]?.id]
      : []
  ));
  if (invalidTokenIds.length > 0) {
    await prisma.userPushToken.deleteMany({ where: { id: { in: invalidTokenIds } } });
  }
}

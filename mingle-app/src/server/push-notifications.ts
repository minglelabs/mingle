import { createHash, createPrivateKey, createSign } from "node:crypto";
import { connect } from "node:http2";
import { resolveTeamNotificationCopy, resolveTeamNotificationText } from "@/i18n/team-notification-copy";
import { prisma } from "@/lib/prisma";
import { feedHref } from "@/lib/feed-routes";
import { resolveAccountBadge, withAccountBadgeLabel } from "@/lib/account-badge";
import { resolveLegalDocumentLocale, resolveSupportedLocaleTag, type LegalDocumentLocale } from "@/i18n/config";
import { resolvePushNotificationCopy } from "@/i18n/notification-copy";
import { resolveOperatorInboxPushCopy } from "@/server/operator-inbox/push-copy";
import { isTeamNotificationType } from "@/lib/user-notification-types";
import { messageRecallCopy } from "@/lib/message-recall";

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
   * conversation_message | follow | comment | comment_reply | voice_call_started |
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
  /**
   * Pushes with the same key replace each other on the device (APNs
   * `apns-collapse-id`, Android notification `tag`) instead of stacking.
   */
  collapseKey?: string;
  /**
   * The sender unsent this message: a silent push that overwrites the
   * delivered one (same `collapseKey`) with the "deleted message" placeholder.
   */
  recalled?: boolean;
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

// Android channel without sound or heads-up, for pushes that only rewrite a
// notification already on the device. App versions without it fall back to
// the default channel (the rewrite still happens, with the usual sound).
const ANDROID_SILENT_CHANNEL_ID = "mingle_silent_updates";
const ANDROID_DEFAULT_CHANNEL_ID = "mingle_notifications";
// APNs rejects a collapse id over 64 bytes.
const COLLAPSE_KEY_MAX_LENGTH = 64;

let cachedFcmAccessToken: CachedFcmAccessToken | null = null;

/** The key a message push and its later "deleted" rewrite share. */
export function conversationMessageCollapseKey(messageId: string): string {
  const key = `msg-${messageId}`;
  return key.length <= COLLAPSE_KEY_MAX_LENGTH && /^[\w-]+$/.test(key)
    ? key
    : `msg-${createHash("sha256").update(messageId).digest("hex").slice(0, 40)}`;
}

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

// `voice_call_started`: someone started voice talk in a room, for all 15
// primary UI languages. `{name}` is the starter as shown.
const VOICE_CALL_STARTED_PUSH_COPY: Record<LegalDocumentLocale, { title: string; body: string }> = {
  ko: { title: "보이스톡", body: "{name}님이 보이스톡을 시작했어요" },
  en: { title: "Voice talk", body: "{name} started a voice talk" },
  ja: { title: "ボイストーク", body: "{name}さんがボイストークを始めました" },
  "zh-CN": { title: "语音通话", body: "{name}发起了语音通话" },
  "zh-TW": { title: "語音通話", body: "{name}發起了語音通話" },
  fr: { title: "Appel vocal", body: "{name} a lancé un appel vocal" },
  de: { title: "Sprachanruf", body: "{name} hat einen Sprachanruf gestartet" },
  es: { title: "Llamada de voz", body: "{name} inició una llamada de voz" },
  pt: { title: "Chamada de voz", body: "{name} iniciou uma chamada de voz" },
  it: { title: "Chiamata vocale", body: "{name} ha avviato una chiamata vocale" },
  ru: { title: "Голосовой звонок", body: "{name} начал(а) голосовой звонок" },
  ar: { title: "مكالمة صوتية", body: "بدأ {name} مكالمة صوتية" },
  hi: { title: "वॉइस कॉल", body: "{name} ने वॉइस कॉल शुरू की" },
  th: { title: "โทรด้วยเสียง", body: "{name} เริ่มการโทรด้วยเสียง" },
  vi: { title: "Cuộc gọi thoại", body: "{name} đã bắt đầu cuộc gọi thoại" },
};

// `conversation_join_request` (to the room's members) and
// `conversation_join_accepted` (to the person who asked), in the 15 primary UI
// languages. `{name}` is the person as shown, `{room}` the room's title.
const JOIN_REQUEST_PUSH_COPY: Record<LegalDocumentLocale, { requestTitle: string; requestBody: string; acceptedTitle: string; acceptedBody: string }> = {
  ko: { requestTitle: "참여 요청", requestBody: "{name}님이 '{room}' 방에 참여를 요청했어요", acceptedTitle: "참여 수락", acceptedBody: "'{room}' 방에 들어갈 수 있어요" },
  en: { requestTitle: "Join request", requestBody: "{name} asked to join '{room}'", acceptedTitle: "Request accepted", acceptedBody: "You can now enter '{room}'" },
  ja: { requestTitle: "参加リクエスト", requestBody: "{name}さんが「{room}」への参加をリクエストしました", acceptedTitle: "参加が承認されました", acceptedBody: "「{room}」に入れます" },
  "zh-CN": { requestTitle: "加入请求", requestBody: "{name}请求加入“{room}”", acceptedTitle: "请求已通过", acceptedBody: "现在可以进入“{room}”了" },
  "zh-TW": { requestTitle: "加入請求", requestBody: "{name}請求加入「{room}」", acceptedTitle: "請求已通過", acceptedBody: "現在可以進入「{room}」了" },
  fr: { requestTitle: "Demande pour rejoindre", requestBody: "{name} demande à rejoindre « {room} »", acceptedTitle: "Demande acceptée", acceptedBody: "Vous pouvez entrer dans « {room} »" },
  de: { requestTitle: "Beitrittsanfrage", requestBody: "{name} möchte „{room}“ beitreten", acceptedTitle: "Anfrage angenommen", acceptedBody: "Du kannst jetzt „{room}“ betreten" },
  es: { requestTitle: "Solicitud para unirse", requestBody: "{name} pidió unirse a «{room}»", acceptedTitle: "Solicitud aceptada", acceptedBody: "Ya puedes entrar en «{room}»" },
  pt: { requestTitle: "Pedido para entrar", requestBody: "{name} pediu para entrar em “{room}”", acceptedTitle: "Pedido aceito", acceptedBody: "Agora você pode entrar em “{room}”" },
  it: { requestTitle: "Richiesta di accesso", requestBody: "{name} ha chiesto di entrare in «{room}»", acceptedTitle: "Richiesta accettata", acceptedBody: "Ora puoi entrare in «{room}»" },
  ru: { requestTitle: "Запрос на вход", requestBody: "{name} просит войти в «{room}»", acceptedTitle: "Запрос принят", acceptedBody: "Теперь можно войти в «{room}»" },
  ar: { requestTitle: "طلب انضمام", requestBody: "طلب {name} الانضمام إلى «{room}»", acceptedTitle: "تم قبول الطلب", acceptedBody: "يمكنك الآن دخول «{room}»" },
  hi: { requestTitle: "जुड़ने का अनुरोध", requestBody: "{name} ने '{room}' में जुड़ने का अनुरोध किया", acceptedTitle: "अनुरोध स्वीकार", acceptedBody: "अब आप '{room}' में जा सकते हैं" },
  th: { requestTitle: "คำขอเข้าร่วม", requestBody: "{name} ขอเข้าร่วม '{room}'", acceptedTitle: "คำขอได้รับการยอมรับ", acceptedBody: "ตอนนี้คุณเข้า '{room}' ได้แล้ว" },
  vi: { requestTitle: "Yêu cầu tham gia", requestBody: "{name} muốn tham gia '{room}'", acceptedTitle: "Yêu cầu được chấp nhận", acceptedBody: "Bạn đã có thể vào '{room}'" },
};

/** Title and body shown on the device, in the recipient's language (unknown -> English). */
export function resolvePushCopy(message: PushMessage): { title: string; body: string } {
  const label = message.actorLabel || "Someone";
  if (isTeamNotificationType(message.type)) {
    const text = resolveTeamNotificationText(
      resolveTeamNotificationCopy(message.recipientLanguage),
      message.type,
      message.messagePreview,
    );
    return {
      title: text.title,
      body: text.body.replace(/\s+/g, " ").trim().slice(0, 240) || "…",
    };
  }
  if (message.type === "conversation_message") {
    const locale = resolveLegalDocumentLocale(resolveSupportedLocaleTag(message.recipientLanguage.trim()) ?? "en");
    const preview = message.recalled
      ? messageRecallCopy(locale).placeholder
      : (message.messagePreview || "").replace(/\s+/g, " ").trim() || "…";
    const copy = CONVERSATION_MESSAGE_PUSH_COPY[locale];
    return { title: copy.title, body: `${label}${copy.separator}${preview}` };
  }
  if (message.type === "conversation_join_request" || message.type === "conversation_join_accepted") {
    const locale = resolveLegalDocumentLocale(resolveSupportedLocaleTag(message.recipientLanguage.trim()) ?? "en");
    const copy = JOIN_REQUEST_PUSH_COPY[locale];
    const room = (message.messagePreview || "").replace(/\s+/g, " ").trim().slice(0, 60) || "…";
    return message.type === "conversation_join_request"
      ? { title: copy.requestTitle, body: copy.requestBody.replace("{name}", label).replace("{room}", room) }
      : { title: copy.acceptedTitle, body: copy.acceptedBody.replace("{room}", room) };
  }
  if (message.type === "voice_call_started") {
    const locale = resolveLegalDocumentLocale(resolveSupportedLocaleTag(message.recipientLanguage.trim()) ?? "en");
    const copy = VOICE_CALL_STARTED_PUSH_COPY[locale];
    return { title: copy.title, body: copy.body.replace("{name}", label) };
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

  return { title: "HashChat", body: "You have a new notification." };
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
  if (message.recalled) data.recalled = "1";
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
    aps: message.recalled
      // Rewrites the delivered notification in place: no sound, no badge
      // change, and no screen wake.
      ? { alert: { title: copy.title, body: copy.body }, "interruption-level": "passive" }
      : { alert: { title: copy.title, body: copy.body }, sound: "default", badge: 1 },
    type: message.type,
    notificationId: message.notificationId,
    ...(message.actorId ? { actorId: message.actorId } : {}),
    messageId: message.notificationId,
    ...(message.sessionKey ? { sessionKey: message.sessionKey } : {}),
    ...(message.conversationId ? { conversationId: message.conversationId } : {}),
    ...(message.navigationUrl ? { url: message.navigationUrl } : {}),
    ...(message.recalled ? { recalled: "1" } : {}),
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
        ...(message.collapseKey ? { "apns-collapse-id": message.collapseKey } : {}),
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
              channel_id: message.recalled ? ANDROID_SILENT_CHANNEL_ID : ANDROID_DEFAULT_CHANNEL_ID,
              icon: "mingle_notification",
              ...(message.recalled ? {} : { sound: "default" }),
              click_action: "MINGLE_NOTIFICATION_OPEN",
              ...(message.collapseKey ? { tag: message.collapseKey } : {}),
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
      body: true,
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

  // Team notifications have no actor; their text is in `body`.
  const actor = notification.actor;
  if (!actor && !isTeamNotificationType(notification.type)) return;

  const recipientLanguage = resolveRecipientLanguage(notification.recipient);
  const recipientLocale = resolveSupportedLocaleTag(recipientLanguage) ?? "en";
  const navigationUrl = notification.postId
    ? feedHref(recipientLocale, {
        postId: notification.postId,
        commentId: notification.commentId,
      })
    : notification.type === "follow" && actor
      // Follow taps open the new follower's profile (same path the web push-tap
      // receiver resolves for `/{locale}/users/{id}`).
      ? `/${recipientLocale}/users/${encodeURIComponent(actor.id)}`
      : undefined;

  const message: PushMessage = {
    notificationId: notification.id,
    type: notification.type,
    actorId: actor?.id ?? "",
    // An operator / official actor keeps its badge on the lock screen too.
    actorLabel: actor
      ? withAccountBadgeLabel(actor.name?.trim() || `@${actor.handle}`, resolveAccountBadge(actor), recipientLanguage)
      : "HashChat",
    recipientLanguage,
    ...(navigationUrl ? { navigationUrl } : {}),
    ...(actor ? {} : { messagePreview: notification.body ?? "" }),
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
/**
 * The message text a recipient sees in the push: the translation into their own
 * language when the message has one, otherwise the original.
 */
export function pickMessagePushText(args: {
  sourceText: string;
  sourceLanguage?: string;
  translations?: Record<string, string>;
  recipientLanguage: string;
}): string {
  const base = (language: string) => language.trim().toLowerCase().replace("_", "-").split("-")[0] || "";
  const recipient = args.recipientLanguage.trim().toLowerCase().replace("_", "-");
  if (!recipient || (args.sourceLanguage && base(args.sourceLanguage) === base(recipient))) return args.sourceText;
  const entries = Object.entries(args.translations ?? {}).filter(([, text]) => text.trim());
  const exact = entries.find(([language]) => language.trim().toLowerCase().replace("_", "-") === recipient);
  const sameBase = entries.find(([language]) => base(language) === base(recipient));
  return (exact ?? sameBase)?.[1] ?? args.sourceText;
}

export async function sendPushNotificationForConversationMessage(args: {
  messageId: string;
  sessionKey: string;
  sourceText: string;
  sourceLanguage?: string;
  /** Finished translations by language; each recipient sees the one in their own language. */
  translations?: Record<string, string>;
  senderUserId: string;
  memberUserIds: string[];
}): Promise<void> {
  if (!readApnsConfig() && !readFcmConfig()) return;
  // A push can be sent seconds after the message (it waits for the
  // translation). A message unsent in that time must not reach a lock screen.
  const current = await prisma.appMessage.findUnique({
    where: { id: args.messageId },
    select: { isDeleted: true },
  });
  if (current?.isDeleted) return;
  await deliverConversationMessagePush({ ...args, recalled: false });
}

/**
 * The sender unsent a message: rewrites the push each recipient already got
 * into the "deleted message" placeholder, silently. A push cannot be taken
 * back, but one with the same collapse key replaces it on the device.
 * Members who opened the room after the message (`lastReadAt`) are skipped:
 * they no longer have that notification, and a rewrite would show a new one.
 */
export async function sendPushNotificationForRecalledConversationMessage(args: {
  messageId: string;
  messageCreatedAt: Date;
  sessionKey: string;
  senderUserId: string;
  memberUserIds: string[];
}): Promise<void> {
  if (!readApnsConfig() && !readFcmConfig()) return;
  const channel = await prisma.appConversationChannel.findUnique({
    where: { sessionKey: args.sessionKey },
    select: { members: { select: { userId: true, lastReadAt: true } } },
  });
  const alreadyRead = new Set(
    (channel?.members ?? [])
      .filter((member) => member.lastReadAt && member.lastReadAt.getTime() >= args.messageCreatedAt.getTime())
      .map((member) => member.userId),
  );
  await deliverConversationMessagePush({
    messageId: args.messageId,
    sessionKey: args.sessionKey,
    sourceText: "",
    senderUserId: args.senderUserId,
    memberUserIds: args.memberUserIds.filter((userId) => !alreadyRead.has(userId)),
    recalled: true,
  });
}

async function deliverConversationMessagePush(args: {
  messageId: string;
  sessionKey: string;
  sourceText: string;
  sourceLanguage?: string;
  translations?: Record<string, string>;
  senderUserId: string;
  memberUserIds: string[];
  recalled: boolean;
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
  const toPreview = (text: string) => text.replace(/\s+/g, " ").trim().slice(0, 240);
  if (!args.recalled && !toPreview(args.sourceText)) return;
  const collapseKey = conversationMessageCollapseKey(args.messageId);

  const targetEntries: PushDelivery[] = [];
  for (const recipientUserId of recipientUserIds) {
    const recipient = users.find((user) => user.id === recipientUserId);
    if (!recipient) continue;
    const recipientLanguage = resolveRecipientLanguage(recipient);
    const messagePreview = args.recalled
      ? ""
      : toPreview(pickMessagePushText({ ...args, recipientLanguage })) || toPreview(args.sourceText);
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
      // "Mina (운영 계정)" / "Mina (Run by HashChat)".
      actorLabel: withAccountBadgeLabel(senderName, senderBadge, recipientLanguage),
      recipientLanguage,
      messagePreview,
      collapseKey,
      ...(args.recalled ? { recalled: true } : {}),
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

/**
 * Someone started voice talk in a room: every other member gets a push that
 * opens the room (where the call panel offers Join / Decline). One push per
 * call; a second push for the same call replaces the first on the device.
 */
export async function sendPushNotificationForVoiceCallStarted(args: {
  channelId: string;
  callId: string;
  starterUserId: string;
  memberUserIds: string[];
}): Promise<void> {
  if (!readApnsConfig() && !readFcmConfig()) return;
  const recipientUserIds = args.memberUserIds.filter((userId) => userId.trim() && userId !== args.starterUserId);
  if (recipientUserIds.length === 0) return;
  const starter = await prisma.user.findUnique({
    where: { id: args.starterUserId },
    select: { name: true, handle: true, isOfficial: true, isOperator: true },
  });
  const starterName = starter?.name?.trim() || (starter?.handle ? `@${starter.handle}` : "Someone");
  const starterBadge = resolveAccountBadge(starter);
  await sendPushToUsers(recipientUserIds, (recipient) => {
    const roomLocale = resolveSupportedLocaleTag(recipient.language) ?? "en";
    return {
      notificationId: args.callId,
      type: "voice_call_started",
      actorId: args.starterUserId,
      actorLabel: withAccountBadgeLabel(starterName, starterBadge, recipient.language),
      recipientLanguage: recipient.language,
      conversationId: args.channelId,
      navigationUrl: `/${roomLocale}/conversations?conversation=${encodeURIComponent(args.channelId)}`,
      collapseKey: `voice-call-${args.callId}`,
    };
  });
}

/**
 * A join request for a private room (to its members) or its acceptance (to the
 * person who asked). The room title rides in `messagePreview`; the tap opens
 * the room (members review requests in its management screen).
 */
export async function sendPushNotificationForConversationJoinRequest(args: {
  kind: "request" | "accepted";
  channelId: string;
  requestId: string;
  requesterUserId: string;
  recipientUserIds: string[];
  roomTitle: string;
}): Promise<void> {
  if (!readApnsConfig() && !readFcmConfig()) return;
  const recipients = args.recipientUserIds.filter((userId) => userId.trim() && (args.kind === "accepted" || userId !== args.requesterUserId));
  if (recipients.length === 0) return;
  const requester = await prisma.user.findUnique({
    where: { id: args.requesterUserId },
    select: { name: true, handle: true, isOfficial: true, isOperator: true },
  });
  const requesterName = requester?.name?.trim() || (requester?.handle ? `@${requester.handle}` : "Someone");
  const badge = resolveAccountBadge(requester);
  await sendPushToUsers(recipients, (recipient) => {
    const roomLocale = resolveSupportedLocaleTag(recipient.language) ?? "en";
    return {
      notificationId: `${args.requestId}:${args.kind}`,
      type: args.kind === "request" ? "conversation_join_request" : "conversation_join_accepted",
      actorId: args.requesterUserId,
      actorLabel: withAccountBadgeLabel(requesterName, badge, recipient.language),
      recipientLanguage: recipient.language,
      messagePreview: args.roomTitle,
      conversationId: args.channelId,
      navigationUrl: `/${roomLocale}/conversations?conversation=${encodeURIComponent(args.channelId)}`,
      collapseKey: `join-request-${args.requestId}-${args.kind}`,
    };
  });
}

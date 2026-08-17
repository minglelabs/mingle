import { createPrivateKey, createSign } from "node:crypto";
import { connect } from "node:http2";
import { prisma } from "@/lib/prisma";

type PushPlatform = "ios" | "android";

type PushTarget = {
  id: string;
  platform: string;
  token: string;
  environment: string;
};

type PushMessage = {
  notificationId: string;
  type: string;
  actorId: string;
  actorLabel: string;
  recipientLanguage: string;
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

function resolvePushCopy(message: PushMessage): { title: string; body: string } {
  const label = message.actorLabel || "Someone";
  const language = message.recipientLanguage.trim().toLowerCase();
  if (message.type === "follow") {
    if (language === "ko") return { title: "새 팔로워", body: `${label}님이 회원님을 팔로우했습니다.` };
    if (language === "ja") return { title: "新しいフォロワー", body: `${label}さんがあなたをフォローしました。` };
    if (language === "zh-cn") return { title: "新的关注者", body: `${label}关注了你。` };
    if (language === "zh-tw") return { title: "新的追蹤者", body: `${label}追蹤了你。` };
    if (language === "es") return { title: "Nuevo seguidor", body: `${label} empezó a seguirte.` };
    if (language === "fr") return { title: "Nouveau follower", body: `${label} vous suit maintenant.` };
    if (language === "de") return { title: "Neuer Follower", body: `${label} folgt Ihnen jetzt.` };
    if (language === "pt") return { title: "Novo seguidor", body: `${label} começou a seguir você.` };
    return { title: "New follower", body: `${label} followed you.` };
  }

  return { title: "Mingle", body: "You have a new notification." };
}

function createPushData(message: PushMessage): Record<string, string> {
  return {
    type: message.type,
    notificationId: message.notificationId,
    actorId: message.actorId,
  };
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
    actorId: message.actorId,
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
              icon: "ic_launcher",
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

export async function sendPushNotificationForUserNotification(notificationId: string): Promise<void> {
  const apnsConfig = readApnsConfig();
  const fcmConfig = readFcmConfig();
  if (!apnsConfig && !fcmConfig) return;

  const notification = await prisma.userNotification.findUnique({
    where: { id: notificationId },
    select: {
      id: true,
      type: true,
      recipient: {
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
      },
      actor: {
        select: {
          id: true,
          handle: true,
          name: true,
        },
      },
    },
  });
  if (!notification) return;

  const message: PushMessage = {
    notificationId: notification.id,
    type: notification.type,
    actorId: notification.actor.id,
    actorLabel: notification.actor.name?.trim() || `@${notification.actor.handle}`,
    recipientLanguage: notification.recipient.pageLanguage?.trim()
      || notification.recipient.language?.trim()
      || "en",
  };
  const targets = notification.recipient.pushTokens as PushTarget[];
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

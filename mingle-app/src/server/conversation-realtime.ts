import { createHmac } from "crypto";
import { mintRealtimeToken, readRealtimeSecret, signRealtimeToken } from "@/lib/realtime-token";
import { verifyVoiceOrderReceipt } from "@/lib/voice-order-receipt";

export async function reserveConversationVoiceOrder(scope: { userId: string; sessionKey: string; clientMessageId: string }): Promise<string | null> {
  const secret = readRealtimeSecret();
  const url = resolveConversationEventsPublishUrl();
  if (!secret || !url) return null;
  try {
    const response = await fetch(url, {
      method: 'POST', signal: AbortSignal.timeout(1500),
      headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
      body: JSON.stringify({ ...scope, reserveOrder: true }),
    });
    if (!response.ok) return null;
    const body = await response.json();
    return verifyVoiceOrderReceipt(body.orderReceipt, scope) !== null ? body.orderReceipt : null;
  } catch { return null; }
}

// Separate short-lived capability; legacy room/list subscription tokens never
// authorize writing. Renewing this requires the app's membership/block checks.
export function mintConversationLiveWriterToken(sessionKey: string, userId: string, name: string | null): string | null {
  const secret = readRealtimeSecret();
  return secret ? signRealtimeToken({ sessionKey, userId, exp: Date.now() + 30_000, liveWriter: { name } }, secret) : null;
}

/**
 * Resolves the messaging service's plain-HTTP publish endpoint. Railway and
 * devbox use an internal messaging URL; deployments that expose only a
 * public WebSocket URL can still fall back to that URL's origin.
 */
function resolveConversationEventsPublishUrl(): string | null {
  const configuredMessagingUrl = (
    process.env.MINGLE_MESSAGING_URL
    || process.env.NEXT_PUBLIC_MESSAGING_WS_URL
    || ""
  ).trim();

  if (configuredMessagingUrl) {
    try {
      const parsed = new URL(configuredMessagingUrl);
      const protocol = parsed.protocol === "ws:"
        ? "http:"
        : parsed.protocol === "wss:"
          ? "https:"
          : parsed.protocol;
      if (protocol !== "http:" && protocol !== "https:") return null;
      const basePath = parsed.pathname.replace(/\/+$/, "")
        .replace(/\/conversation-events(?:\/publish)?$/, "");
      return `${protocol}//${parsed.host}${basePath}/conversation-events/publish`;
    } catch {
      return null;
    }
  }

  const fallbackWsUrl = (process.env.NEXT_PUBLIC_WS_URL || "").trim();
  if (!fallbackWsUrl) return null;

  try {
    const origin = new URL(fallbackWsUrl).origin.replace(/^ws/, "http");
    return `${origin}/conversation-events/publish`;
  } catch {
    return null;
  }
}

/**
 * Lets a conversation screen open a push channel on mingle-messaging without that
 * service ever touching Prisma: this server has already confirmed the
 * caller belongs to the channel behind `sessionKey` by the time it mints
 * this, and mingle-messaging only checks the signature and expiry.
 */
export function mintConversationRealtimeToken(args: {
  sessionKey: string;
  userId: string;
  live?: boolean;
}): string | null {
  const secret = readRealtimeSecret();
  if (!secret) return null;
  return args.live
    ? signRealtimeToken({ sessionKey: args.sessionKey, userId: args.userId, exp: Date.now() + 30_000, liveReader: true }, secret)
    : mintRealtimeToken({ sessionKey: args.sessionKey, userId: args.userId, secret });
}

/**
 * The conversation-events bus key is just an opaque subscribe/publish
 * string as far as mingle-messaging is concerned (it never parses `sessionKey`,
 * only checks the token's signature) — so a per-user "list" topic can reuse
 * the exact same bus/token plumbing as a per-room one, just keyed
 * differently. Exported so the publish side (notifyConversationMessage)
 * builds the identical key.
 */
export function buildConversationListEventKey(userId: string): string {
  return `list:${userId}`;
}

// Must match buildConversationListEventKey above.
const CONVERSATION_LIST_EVENT_KEY_PREFIX = "list:";
const ADMIN_INBOX_EVENT_KEY_PREFIX = "admin:";
const ADMIN_INBOX_EVENT_KEY_CONTEXT = "admin-inbox:v1";
const ADMIN_INBOX_REALTIME_USER_ID = "admin";
const ADMIN_INBOX_PUBLISH_TIMEOUT_MS = 3_000;
const CONVERSATION_EVENTS_WS_PATH = "/conversation-events";

/**
 * True for a bus key that is NOT a room: a user's conversation-list topic
 * (`list:<userId>`) or the admin inbox topic (`admin:<hmac>`). A room whose
 * sessionKey carried one of these prefixes would let its members mint a
 * subscription token for that topic, so a client-supplied key with such a
 * prefix never becomes a room's sessionKey (see postConversationResponse).
 */
export function isReservedRealtimeEventKey(key: string): boolean {
  const normalized = key.trim().toLowerCase();
  return normalized.startsWith(CONVERSATION_LIST_EVENT_KEY_PREFIX)
    || normalized.startsWith(ADMIN_INBOX_EVENT_KEY_PREFIX);
}

/**
 * The admin inbox topic: `admin:` + the first 32 hex characters of
 * HMAC-SHA256(MINGLE_REALTIME_SECRET, "admin-inbox:v1"). Stable for a given
 * secret and not computable without it. It only ever receives content-free
 * invalidations (publishAdminInboxEvent sends it through `keys`), and no room
 * can be keyed with its prefix (isReservedRealtimeEventKey). Null when
 * realtime is unconfigured.
 */
export function buildAdminInboxEventKey(): string | null {
  const secret = readRealtimeSecret();
  if (!secret) return null;
  const digest = createHmac("sha256", secret).update(ADMIN_INBOX_EVENT_KEY_CONTEXT).digest("hex");
  return `${ADMIN_INBOX_EVENT_KEY_PREFIX}${digest.slice(0, 32)}`;
}

/**
 * One-hour subscription token for the admin inbox topic. Only admin route
 * handlers may call this, after `requireAdminApi`.
 */
export function mintAdminInboxRealtimeToken(): string | null {
  const secret = readRealtimeSecret();
  const sessionKey = buildAdminInboxEventKey();
  if (!secret || !sessionKey) return null;
  return mintRealtimeToken({ sessionKey, userId: ADMIN_INBOX_REALTIME_USER_ID, secret });
}

/**
 * Tells an open admin inbox that a room with an operator account changed.
 * Content-free: the key goes in `keys` with no `sessionKey`, so the socket
 * only receives `{ type: "message", sessionKey: <admin key> }` and refetches.
 * Best-effort and bounded by a timeout; never throws.
 */
export async function publishAdminInboxEvent(options?: { timeoutMs?: number }): Promise<void> {
  const secret = readRealtimeSecret();
  const publishUrl = resolveConversationEventsPublishUrl();
  const key = buildAdminInboxEventKey();
  if (!secret || !publishUrl || !key) return;

  try {
    const response = await fetch(publishUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ keys: [key] }),
      signal: AbortSignal.timeout(options?.timeoutMs ?? ADMIN_INBOX_PUBLISH_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.warn("[conversation-realtime] admin_publish_failed", { status: response.status });
    }
  } catch (error) {
    // The admin inbox also polls, so a dropped event only delays the refresh.
    console.warn("[conversation-realtime] admin_publish_error", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function firstHeaderValue(headers: Headers, name: string): string {
  return (headers.get(name) || "").split(",")[0].trim();
}

const PUBLIC_HOST_PATTERN = /^(?:\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9.-]+)(?::\d{1,5})?$/;

/**
 * The conversation-events WebSocket URL a browser on this request's page
 * should open, resolved like the client's `getConversationEventsWsUrl`: the
 * configured messaging URL, else the origin of the configured speech socket,
 * else the page's own origin (the request's public origin behind the proxy)
 * + `/conversation-events`. Null when no usable URL can be built.
 */
export function resolveConversationEventsWsUrl(request: { url: string; headers: Headers }): string | null {
  const configuredMessagingUrl = (process.env.NEXT_PUBLIC_MESSAGING_WS_URL || "").trim();
  if (configuredMessagingUrl) {
    try {
      const url = new URL(configuredMessagingUrl);
      if (url.pathname === "/" || url.pathname === "") url.pathname = CONVERSATION_EVENTS_WS_PATH;
      return url.toString();
    } catch {
      return null;
    }
  }

  const configuredSpeechUrl = (process.env.NEXT_PUBLIC_WS_URL || "").trim();
  if (configuredSpeechUrl) {
    try {
      return `${new URL(configuredSpeechUrl).origin}${CONVERSATION_EVENTS_WS_PATH}`;
    } catch {
      return null;
    }
  }

  let requestUrl: URL;
  try {
    requestUrl = new URL(request.url);
  } catch {
    return null;
  }
  const forwardedProto = firstHeaderValue(request.headers, "x-forwarded-proto").toLowerCase();
  const secure = forwardedProto ? forwardedProto === "https" : requestUrl.protocol === "https:";
  const host = [
    firstHeaderValue(request.headers, "x-forwarded-host"),
    firstHeaderValue(request.headers, "host"),
    requestUrl.host,
  ].find((candidate) => candidate && PUBLIC_HOST_PATTERN.test(candidate));
  return host ? `${secure ? "wss" : "ws"}://${host}${CONVERSATION_EVENTS_WS_PATH}` : null;
}

/**
 * Lets the conversation LIST screen (not a specific open room) subscribe to
 * "something changed in one of my rooms" pushes, so a new message shows up
 * there without the user having to open the room or refresh the page.
 */
export function mintConversationListRealtimeToken(userId: string): string | null {
  const secret = readRealtimeSecret();
  if (!secret) return null;
  return mintRealtimeToken({
    sessionKey: buildConversationListEventKey(userId),
    userId,
    secret,
  });
}

/**
 * Tells mingle-messaging a message landed, so it can push to anyone watching this
 * room AND to every member's conversation-list screen (`memberUserIds`) —
 * without the list fan-out, a member who has the room closed only finds out
 * about a new message on their next poll/mount instead of immediately.
 * Best-effort: realtime push is still a latency optimization over the
 * client's own poll fallback, never something a message send should fail on.
 * The returned promise is awaited by message handlers so a serverless request
 * does not terminate before the publish request has been handed to messaging.
 */
export async function notifyConversationMessage(sessionKey: string, memberUserIds: string[] = [], utterance?: Record<string, unknown>, options?: { timeoutMs: number }): Promise<void> {
  const secret = readRealtimeSecret();
  const publishUrl = resolveConversationEventsPublishUrl();
  const normalizedSessionKey = sessionKey.trim();
  const listKeys = [...new Set(
    memberUserIds.map((id) => id.trim()).filter(Boolean).map(buildConversationListEventKey),
  )];
  if (!secret || !publishUrl || (!normalizedSessionKey && listKeys.length === 0)) return;

  try {
    const response = await fetch(publishUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ sessionKey: normalizedSessionKey || undefined, keys: listKeys, ...(utterance ? { utterance } : {}) }),
      ...(options ? { signal: AbortSignal.timeout(options.timeoutMs) } : {}),
    });
    if (!response.ok) {
      console.warn("[conversation-realtime] publish_failed", { status: response.status });
    }
  } catch (error) {
    // A dropped notification just means that one client relies on its poll
    // fallback for this message instead of getting it pushed.
    console.warn("[conversation-realtime] publish_error", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

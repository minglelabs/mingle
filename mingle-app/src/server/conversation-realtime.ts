import { mintRealtimeToken, readRealtimeSecret } from "@/lib/realtime-token";

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
}): string | null {
  const secret = readRealtimeSecret();
  if (!secret) return null;
  return mintRealtimeToken({ sessionKey: args.sessionKey, userId: args.userId, secret });
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
 * Best-effort and fire-and-forget on purpose: realtime push is a latency
 * optimization over the client's own poll fallback, never something a
 * message send should fail on.
 */
export function notifyConversationMessage(sessionKey: string, memberUserIds: string[] = []): void {
  const secret = readRealtimeSecret();
  const publishUrl = resolveConversationEventsPublishUrl();
  const normalizedSessionKey = sessionKey.trim();
  const listKeys = [...new Set(
    memberUserIds.map((id) => id.trim()).filter(Boolean).map(buildConversationListEventKey),
  )];
  if (!secret || !publishUrl || (!normalizedSessionKey && listKeys.length === 0)) return;

  fetch(publishUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({ sessionKey: normalizedSessionKey || undefined, keys: listKeys }),
  }).catch(() => {
    // A dropped notification just means that one client relies on its poll
    // fallback for this message instead of getting it pushed.
  });
}

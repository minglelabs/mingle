import { mintRealtimeToken, readRealtimeSecret } from "@/lib/realtime-token";

/**
 * Derives mingle-stt's plain-HTTP origin from the same env var the client
 * uses to reach its WebSocket (`NEXT_PUBLIC_WS_URL`, e.g.
 * `wss://host/stt`) — same host and port, ws(s) swapped for http(s). Kept
 * separate from the client's own URL resolution because that one falls back
 * to `window.location`, which does not exist on the server.
 */
function resolveConversationEventsPublishUrl(): string | null {
  const configured = (process.env.NEXT_PUBLIC_WS_URL || "").trim();
  if (!configured) return null;

  try {
    const origin = new URL(configured).origin.replace(/^ws/, "http");
    return `${origin}/conversation-events/publish`;
  } catch {
    return null;
  }
}

/**
 * Lets a conversation screen open a push channel on mingle-stt without that
 * service ever touching Prisma: this server has already confirmed the
 * caller belongs to the channel behind `sessionKey` by the time it mints
 * this, and mingle-stt only checks the signature and expiry.
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
 * string as far as mingle-stt is concerned (it never parses `sessionKey`,
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
 * Tells mingle-stt a message landed, so it can push to anyone watching this
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

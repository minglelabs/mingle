import { mintRealtimeToken, readRealtimeSecret } from "@/lib/realtime-token";

/**
 * Derives mingle-stt's plain-HTTP origin from the same env var the client
 * uses to reach its WebSocket (`NEXT_PUBLIC_WS_URL`, e.g.
 * `wss://host/stt`) — same host and port, ws(s) swapped for http(s). Kept
 * separate from the client's `getWsUrl()` because that one falls back to
 * `window.location`, which does not exist on the server.
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
 * service ever touching Prisma: this server has already confirmed the caller
 * belongs to `conversationId` by the time it mints this, and mingle-stt only
 * checks the signature and expiry.
 */
export function mintConversationRealtimeToken(args: {
  conversationId: string;
  userId: string;
}): string | null {
  const secret = readRealtimeSecret();
  if (!secret) return null;
  return mintRealtimeToken({ conversationId: args.conversationId, userId: args.userId, secret });
}

/**
 * Tells mingle-stt a message landed, so it can push to anyone watching this
 * conversation. Best-effort and fire-and-forget on purpose: realtime push is
 * a latency optimization over the client's polling fallback, never a
 * dependency a send should fail on.
 */
export function notifyConversationMessage(args: {
  conversationId: string;
  messageId: string;
}): void {
  const secret = readRealtimeSecret();
  const publishUrl = resolveConversationEventsPublishUrl();
  if (!secret || !publishUrl) return;

  fetch(publishUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({ conversationId: args.conversationId, messageId: args.messageId }),
  }).catch(() => {
    // A dropped notification just means that one client relies on its poll
    // fallback for this message instead of getting it pushed.
  });
}

/**
 * 1:1 voice talk from a post (owner, 2026-11-25; the rules are in
 * src/server/post-calls.ts). Client-safe: the card, the call screen, the
 * incoming-call screen and the server all read this.
 */

/** How long the author's phone rings (and the caller waits). */
export const POST_CALL_RING_MS = 30_000;

/** Sent on `window` when this account just put up a call post: calls may come from now on. */
export const POST_CALL_LISTEN_EVENT = "mingle:post-call-listen";

export const POST_CALL_STATUSES = ["ringing", "accepted", "declined", "missed", "cancelled", "ended"] as const;
export type PostCallStatus = (typeof POST_CALL_STATUSES)[number];

export type PostCallPeer = {
  userId: string;
  name: string;
  image: string | null;
  /** ISO 3166-1 alpha-2. */
  country: string | null;
  age: number | null;
  /** The first language they are comfortable in. */
  language: string | null;
};

export type PostCallView = {
  id: string;
  status: PostCallStatus;
  /** This viewer's side: the one who pressed the button, or the post's author. */
  role: "caller" | "author";
  /** The hidden room the call runs in (the call screen opens it). */
  conversationId: string;
  ringEndsAt: string;
  peer: PostCallPeer;
};

export function isPostCallOver(status: string): boolean {
  return status !== "ringing" && status !== "accepted";
}

/** Whole seconds left on the ring, never below zero. */
export function postCallSecondsLeft(ringEndsAt: string, nowMs: number): number {
  const end = Date.parse(ringEndsAt);
  if (!Number.isFinite(end)) return 0;
  // Never more than the ring itself, whatever this phone's clock says.
  return Math.min(POST_CALL_RING_MS / 1000, Math.max(0, Math.ceil((end - nowMs) / 1000)));
}

/**
 * Whether interpretation starts on by itself (owner, 2026-11-25): only when
 * the two speak different languages. Compared by base language ("zh-CN" and
 * "zh-TW" are the same language to the ear).
 */
export function postCallInterpretsByDefault(myLanguage: string | null | undefined, peerLanguage: string | null | undefined): boolean {
  const base = (value: string | null | undefined) => (value ?? "").trim().toLowerCase().split(/[-_]/)[0] ?? "";
  const mine = base(myLanguage);
  const theirs = base(peerLanguage);
  return Boolean(mine && theirs && mine !== theirs);
}

export function parsePostCallView(value: unknown): PostCallView | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const peer = row.peer as Record<string, unknown> | null | undefined;
  if (typeof row.id !== "string" || typeof row.conversationId !== "string" || !peer || typeof peer.userId !== "string") return null;
  if (!(POST_CALL_STATUSES as readonly unknown[]).includes(row.status)) return null;
  return {
    id: row.id,
    status: row.status as PostCallStatus,
    role: row.role === "author" ? "author" : "caller",
    conversationId: row.conversationId,
    ringEndsAt: typeof row.ringEndsAt === "string" ? row.ringEndsAt : "",
    peer: {
      userId: peer.userId,
      name: typeof peer.name === "string" ? peer.name : "",
      image: typeof peer.image === "string" ? peer.image : null,
      country: typeof peer.country === "string" ? peer.country : null,
      age: typeof peer.age === "number" ? peer.age : null,
      language: typeof peer.language === "string" ? peer.language : null,
    },
  };
}

// The call screen is opened for a call just asked for or just answered; the
// room screen takes the mark once and shows the call screen at once, without
// waiting for the room's record to say what kind of room it is.
const ENTRY_KEY = "mingle.post-call.entry";
const ENTRY_TTL_MS = 60_000;

export function markPostCallEntry(conversationId: string): void {
  try {
    window.sessionStorage.setItem(ENTRY_KEY, JSON.stringify({ conversationId, at: Date.now() }));
  } catch {
    // No storage: the room's record still says it is a call.
  }
}

export function takePostCallEntry(conversationId: string): boolean {
  try {
    const raw = window.sessionStorage.getItem(ENTRY_KEY);
    if (!raw) return false;
    const entry = JSON.parse(raw) as { conversationId?: unknown; at?: unknown } | null;
    if (!entry || entry.conversationId !== conversationId || typeof entry.at !== "number") return false;
    if (Date.now() - entry.at > ENTRY_TTL_MS) return false;
    window.sessionStorage.removeItem(ENTRY_KEY);
    return true;
  } catch {
    return false;
  }
}

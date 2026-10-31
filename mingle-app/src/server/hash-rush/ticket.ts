import { createHmac, timingSafeEqual } from "node:crypto";

// Entry ticket for the Hash Rush game server: "<base64url payload>.<base64url HMAC-SHA256>".
// The game server checks it with the same HASH_RUSH_TICKET_SECRET, so only
// members of a chat room get into that room's game, under their chat name.

export type HashRushTicket = { room: string; userId: string; name: string; exp: number };

const b64url = (input: Buffer | string) =>
  Buffer.from(input).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

export function signHashRushTicket(payload: HashRushTicket, secret: string): string {
  const body = b64url(JSON.stringify(payload));
  return `${body}.${b64url(createHmac("sha256", secret).update(body).digest())}`;
}

export function verifyHashRushTicket(ticket: string, secret: string, nowSec = Math.floor(Date.now() / 1000)): HashRushTicket | null {
  const [body, signature] = String(ticket || "").split(".");
  if (!body || !signature) return null;
  const expected = createHmac("sha256", secret).update(body).digest();
  const actual = Buffer.from(signature.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as HashRushTicket;
    return typeof payload.exp === "number" && payload.exp >= nowSec ? payload : null;
  } catch {
    return null;
  }
}

// Game room ids allow [a-z0-9_-]; channel ids are cuids, so they fit as is.
export function hashRushRoomId(channelId: string): string {
  return `mingle-${channelId.toLowerCase().replace(/[^a-z0-9_-]/g, "")}`.slice(0, 64);
}

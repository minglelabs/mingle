import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

// A chat room's Hash Rush invite link: "<base64url channel id>.<HMAC>". It
// does not expire; it works for as long as the chat room exists (the link
// route checks that), and anyone who has it can play: a member of the room
// under their name, anyone else as a guest.

const b64url = (input: Buffer | string) =>
  Buffer.from(input).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const fromB64url = (input: string) => Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/"), "base64");

function mac(channelId: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(`hash-rush-invite:${channelId}`).digest().subarray(0, 18);
}

export function signHashRushInvite(channelId: string, secret: string): string {
  return `${b64url(channelId)}.${b64url(mac(channelId, secret))}`;
}

/** The chat room an invite code is for, or null when it is not one of ours. */
export function verifyHashRushInvite(code: string, secret: string): string | null {
  const [body, signature, ...rest] = String(code || "").split(".");
  if (!body || !signature || rest.length || !secret) return null;
  const channelId = fromB64url(body).toString("utf8");
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(channelId)) return null;
  const given = fromB64url(signature);
  const expected = mac(channelId, secret);
  return given.length === expected.length && timingSafeEqual(given, expected) ? channelId : null;
}

/** A guest's game identity: not an account, so it never lands in the rankings. */
export const HASH_RUSH_GUEST_PREFIX = "guest-";

export function newHashRushGuest(): { userId: string; name: string } {
  const tag = String(randomInt(100, 1000));
  return { userId: `${HASH_RUSH_GUEST_PREFIX}${Date.now().toString(36)}${randomInt(1e9).toString(36)}`, name: `Guest${tag}` };
}

export function isHashRushGuestId(userId: string): boolean {
  return userId.startsWith(HASH_RUSH_GUEST_PREFIX);
}

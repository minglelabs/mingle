import { createHmac, timingSafeEqual } from "crypto";

/**
 * Scopes a WebSocket subscription on mingle-messaging to one conversation's
 * sessionKey. Mirrors mingle-messaging/realtime-token.ts's verify logic —
 * the two packages don't share code (no workspace linking them), so this
 * pairing has to be kept in sync by hand. Signing happens here, after this
 * server has already checked membership; mingle-messaging's half never touches a
 * database, it only checks the signature and expiry.
 */
export type RealtimeTokenPayload = {
  sessionKey: string;
  userId: string;
  exp: number;
};

const REALTIME_TOKEN_TTL_MS = 60 * 60 * 1000;

function isRealtimeTokenPayload(value: unknown): value is RealtimeTokenPayload {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.sessionKey === "string" && record.sessionKey.trim() !== ""
    && typeof record.userId === "string" && record.userId.trim() !== ""
    && typeof record.exp === "number" && Number.isFinite(record.exp)
  );
}

export function signRealtimeToken(payload: RealtimeTokenPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifyRealtimeToken(token: string, secret: string): RealtimeTokenPayload | null {
  const separatorIndex = token.indexOf(".");
  if (separatorIndex <= 0) return null;

  const body = token.slice(0, separatorIndex);
  const signature = token.slice(separatorIndex + 1);
  if (!body || !signature) return null;

  const expectedSignature = createHmac("sha256", secret).update(body).digest("base64url");
  const provided = Buffer.from(signature, "utf8");
  const expected = Buffer.from(expectedSignature, "utf8");
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!isRealtimeTokenPayload(payload)) return null;
  if (payload.exp < Date.now()) return null;
  return payload;
}

/** Reads the secret shared with mingle-messaging. Empty when realtime push is unconfigured. */
export function readRealtimeSecret(): string {
  return (process.env.MINGLE_REALTIME_SECRET || "").trim();
}

export function mintRealtimeToken(args: {
  sessionKey: string;
  userId: string;
  secret: string;
}): string {
  return signRealtimeToken({
    sessionKey: args.sessionKey,
    userId: args.userId,
    exp: Date.now() + REALTIME_TOKEN_TTL_MS,
  }, args.secret);
}

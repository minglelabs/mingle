import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Scopes a WebSocket subscription to one conversation. mingle-stt has no
 * database of its own, so it cannot check room membership itself — mingle-app
 * checks it once, at mint time, and this token is what carries that decision
 * over here. Verification here is purely "was this actually signed by
 * mingle-app, and has it not expired" — nothing more.
 */
export type RealtimeTokenPayload = {
  conversationId: string;
  userId: string;
  exp: number;
};

function isRealtimeTokenPayload(value: unknown): value is RealtimeTokenPayload {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.conversationId === 'string' && record.conversationId.trim() !== ''
    && typeof record.userId === 'string' && record.userId.trim() !== ''
    && typeof record.exp === 'number' && Number.isFinite(record.exp)
  );
}

export function signRealtimeToken(payload: RealtimeTokenPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${signature}`;
}

/**
 * Returns the payload only if the signature matches under `secret` and the
 * token has not expired. Any malformed input — wrong shape, bad JSON, missing
 * segment — returns null rather than throwing, since this sits directly on
 * the WebSocket upgrade path and a bad token is just an unauthenticated
 * client, not a server fault.
 */
export function verifyRealtimeToken(token: string, secret: string): RealtimeTokenPayload | null {
  const separatorIndex = token.indexOf('.');
  if (separatorIndex <= 0) return null;

  const body = token.slice(0, separatorIndex);
  const signature = token.slice(separatorIndex + 1);
  if (!body || !signature) return null;

  const expectedSignature = createHmac('sha256', secret).update(body).digest('base64url');
  const provided = Buffer.from(signature, 'utf8');
  const expected = Buffer.from(expectedSignature, 'utf8');
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!isRealtimeTokenPayload(payload)) return null;
  if (payload.exp < Date.now()) return null;
  return payload;
}

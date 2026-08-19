import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Verifies the token mingle-app mints after checking channel membership.
 * Mirrors mingle-app/src/lib/realtime-token.ts's payload shape and signing
 * exactly — kept in sync by hand since the two packages share no code.
 * This side never touches a database: the signature is mingle-app's word
 * that the token holder is a real member of `sessionKey`'s conversation.
 */
export type RealtimeTokenPayload = {
    sessionKey: string;
    userId: string;
    exp: number;
};

function isRealtimeTokenPayload(value: unknown): value is RealtimeTokenPayload {
    if (typeof value !== 'object' || value === null) return false;
    const record = value as Record<string, unknown>;
    return (
        typeof record.sessionKey === 'string' && record.sessionKey.trim() !== ''
        && typeof record.userId === 'string' && record.userId.trim() !== ''
        && typeof record.exp === 'number' && Number.isFinite(record.exp)
    );
}

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

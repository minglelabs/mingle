import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'crypto';

import { verifyRealtimeToken } from '../realtime-token';

// Mirrors mingle-app's signRealtimeToken exactly, since the two packages
// share no code — this confirms that the independent implementations interoperate.
function signToken(payload: { sessionKey: string; userId: string; exp: number }, secret: string): string {
    const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const signature = createHmac('sha256', secret).update(body).digest('base64url');
    return `${body}.${signature}`;
}

test('verifies a token signed the way mingle-app signs it', () => {
    const token = signToken({ sessionKey: 'sess_abc', userId: 'user-1', exp: Date.now() + 60_000 }, 'shh');
    const payload = verifyRealtimeToken(token, 'shh');
    assert.equal(payload?.sessionKey, 'sess_abc');
    assert.equal(payload?.userId, 'user-1');
});

test('rejects a token signed with a different secret', () => {
    const token = signToken({ sessionKey: 'sess_abc', userId: 'user-1', exp: Date.now() + 60_000 }, 'shh');
    assert.equal(verifyRealtimeToken(token, 'other'), null);
});

test('rejects an expired token', () => {
    const token = signToken({ sessionKey: 'sess_abc', userId: 'user-1', exp: Date.now() - 1_000 }, 'shh');
    assert.equal(verifyRealtimeToken(token, 'shh'), null);
});

test('rejects malformed tokens', () => {
    assert.equal(verifyRealtimeToken('', 'shh'), null);
    assert.equal(verifyRealtimeToken('no-dot-here', 'shh'), null);
    assert.equal(verifyRealtimeToken('.missing-body', 'shh'), null);
});

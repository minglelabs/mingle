import test from 'node:test';
import assert from 'node:assert/strict';

import { signRealtimeToken, verifyRealtimeToken } from '../realtime-token';

const SECRET = 'test-secret';

test('round-trips a payload signed with the same secret', () => {
    const payload = { conversationId: 'conv-1', userId: 'u1', exp: Date.now() + 60_000 };
    const token = signRealtimeToken(payload, SECRET);

    assert.deepEqual(verifyRealtimeToken(token, SECRET), payload);
});

test('rejects a token signed with a different secret', () => {
    const token = signRealtimeToken({ conversationId: 'conv-1', userId: 'u1', exp: Date.now() + 60_000 }, SECRET);

    assert.equal(verifyRealtimeToken(token, 'wrong-secret'), null);
});

test('rejects an expired token even with a correct signature', () => {
    const token = signRealtimeToken({ conversationId: 'conv-1', userId: 'u1', exp: Date.now() - 1 }, SECRET);

    assert.equal(verifyRealtimeToken(token, SECRET), null);
});

test('rejects a tampered payload whose signature no longer matches', () => {
    const token = signRealtimeToken({ conversationId: 'conv-1', userId: 'u1', exp: Date.now() + 60_000 }, SECRET);
    const [body] = token.split('.');
    const tamperedPayload = Buffer.from(JSON.stringify({ conversationId: 'conv-2', userId: 'u1', exp: Date.now() + 60_000 }), 'utf8').toString('base64url');
    const tampered = token.replace(body, tamperedPayload);

    assert.equal(verifyRealtimeToken(tampered, SECRET), null);
});

test('rejects malformed input without throwing', () => {
    assert.equal(verifyRealtimeToken('', SECRET), null);
    assert.equal(verifyRealtimeToken('not-a-token', SECRET), null);
    assert.equal(verifyRealtimeToken('.', SECRET), null);
    assert.equal(verifyRealtimeToken('abc.def', SECRET), null);
});

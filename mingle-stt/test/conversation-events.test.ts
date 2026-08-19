import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'events';
import { createHmac } from 'crypto';

import {
    ConversationEventBus,
    handleConversationEventsConnection,
    handleConversationEventsPublish,
    isConversationEventsRequestUrl,
} from '../conversation-events';

const SECRET = 'test-secret';

function signToken(payload: { sessionKey: string; userId: string; exp: number }, secret: string): string {
    const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const signature = createHmac('sha256', secret).update(body).digest('base64url');
    return `${body}.${signature}`;
}

class FakeSocket extends EventEmitter {
    readyState = 1;
    OPEN = 1;
    sent: string[] = [];
    closedWith: { code: number; reason: string } | null = null;

    send(payload: string) {
        this.sent.push(payload);
    }

    close(code: number, reason: string) {
        this.closedWith = { code, reason };
    }
}

test('isConversationEventsRequestUrl matches only the two known paths', () => {
    assert.equal(isConversationEventsRequestUrl('/conversation-events'), true);
    assert.equal(isConversationEventsRequestUrl('/conversation-events?token=abc'), true);
    assert.equal(isConversationEventsRequestUrl('/conversation-events/publish'), true);
    assert.equal(isConversationEventsRequestUrl('/stt'), false);
    assert.equal(isConversationEventsRequestUrl(undefined), false);
});

test('ConversationEventBus only pushes to sockets subscribed to that sessionKey', () => {
    const bus = new ConversationEventBus();
    const a = new FakeSocket();
    const b = new FakeSocket();
    bus.subscribe('sess_a', a as unknown as import('ws').WebSocket);
    bus.subscribe('sess_b', b as unknown as import('ws').WebSocket);

    bus.publish('sess_a');

    assert.equal(a.sent.length, 1);
    assert.deepEqual(JSON.parse(a.sent[0]), { type: 'message', sessionKey: 'sess_a' });
    assert.equal(b.sent.length, 0);
});

test('ConversationEventBus skips closed sockets and cleans up on unsubscribe', () => {
    const bus = new ConversationEventBus();
    const socket = new FakeSocket();
    bus.subscribe('sess_a', socket as unknown as import('ws').WebSocket);
    assert.equal(bus.subscriberCount('sess_a'), 1);

    bus.unsubscribe('sess_a', socket as unknown as import('ws').WebSocket);
    assert.equal(bus.subscriberCount('sess_a'), 0);

    bus.publish('sess_a');
    assert.equal(socket.sent.length, 0);
});

test('handleConversationEventsConnection rejects a missing or invalid token', () => {
    const bus = new ConversationEventBus();
    const socket = new FakeSocket();
    handleConversationEventsConnection(socket as unknown as import('ws').WebSocket, '/conversation-events', SECRET, bus);
    assert.equal(socket.closedWith?.code, 4401);
    assert.equal(bus.subscriberCount('sess_a'), 0);
});

test('handleConversationEventsConnection subscribes a socket with a valid token and unsubscribes on close', () => {
    const bus = new ConversationEventBus();
    const socket = new FakeSocket();
    const token = signToken({ sessionKey: 'sess_a', userId: 'user-1', exp: Date.now() + 60_000 }, SECRET);

    handleConversationEventsConnection(
        socket as unknown as import('ws').WebSocket,
        `/conversation-events?token=${encodeURIComponent(token)}`,
        SECRET,
        bus,
    );

    assert.equal(bus.subscriberCount('sess_a'), 1);
    socket.emit('close');
    assert.equal(bus.subscriberCount('sess_a'), 0);
});

class FakeRequest extends EventEmitter {
    headers: Record<string, string>;
    private body: string;

    constructor(body: string, headers: Record<string, string> = {}) {
        super();
        this.body = body;
        this.headers = headers;
    }

    emitBody() {
        this.emit('data', Buffer.from(this.body, 'utf8'));
        this.emit('end');
    }
}

class FakeResponse {
    statusCode: number | null = null;
    headers: Record<string, string> = {};
    body = '';

    writeHead(statusCode: number, headers?: Record<string, string>) {
        this.statusCode = statusCode;
        if (headers) this.headers = headers;
    }

    end(body?: string) {
        if (body) this.body = body;
    }
}

test('handleConversationEventsPublish rejects a wrong or missing bearer secret', async () => {
    const bus = new ConversationEventBus();
    const request = new FakeRequest('{}', { authorization: 'Bearer wrong' });
    const response = new FakeResponse();

    const promise = handleConversationEventsPublish(
        request as unknown as import('http').IncomingMessage,
        response as unknown as import('http').ServerResponse,
        SECRET,
        bus,
    );
    request.emitBody();
    await promise;

    assert.equal(response.statusCode, 401);
});

test('handleConversationEventsPublish rejects an unconfigured (empty) server secret even if the caller sends one', async () => {
    const bus = new ConversationEventBus();
    const request = new FakeRequest('{}', { authorization: 'Bearer anything' });
    const response = new FakeResponse();

    const promise = handleConversationEventsPublish(
        request as unknown as import('http').IncomingMessage,
        response as unknown as import('http').ServerResponse,
        '',
        bus,
    );
    request.emitBody();
    await promise;

    assert.equal(response.statusCode, 401);
});

test('handleConversationEventsPublish publishes to subscribers on a valid request', async () => {
    const bus = new ConversationEventBus();
    const socket = new FakeSocket();
    bus.subscribe('sess_a', socket as unknown as import('ws').WebSocket);

    const request = new FakeRequest(JSON.stringify({ sessionKey: 'sess_a' }), { authorization: `Bearer ${SECRET}` });
    const response = new FakeResponse();

    const promise = handleConversationEventsPublish(
        request as unknown as import('http').IncomingMessage,
        response as unknown as import('http').ServerResponse,
        SECRET,
        bus,
    );
    request.emitBody();
    await promise;

    assert.equal(response.statusCode, 204);
    assert.equal(socket.sent.length, 1);
});

test('handleConversationEventsPublish rejects a payload without a sessionKey', async () => {
    const bus = new ConversationEventBus();
    const request = new FakeRequest(JSON.stringify({}), { authorization: `Bearer ${SECRET}` });
    const response = new FakeResponse();

    const promise = handleConversationEventsPublish(
        request as unknown as import('http').IncomingMessage,
        response as unknown as import('http').ServerResponse,
        SECRET,
        bus,
    );
    request.emitBody();
    await promise;

    assert.equal(response.statusCode, 400);
});

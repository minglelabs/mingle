import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'http';

import {
    ConversationEventBus,
    handleConversationEventsConnection,
    handleConversationEventsPublish,
    isConversationEventsRequestUrl,
} from '../conversation-events';
import { signRealtimeToken } from '../realtime-token';

const SECRET = 'test-secret';

class FakeSocket extends EventEmitter {
    readyState = 1;
    OPEN = 1;
    sent: string[] = [];

    send(payload: string): void {
        this.sent.push(payload);
    }
}

test('isConversationEventsRequestUrl matches only the two known paths, ignoring query strings', () => {
    assert.equal(isConversationEventsRequestUrl('/conversation-events?token=abc'), true);
    assert.equal(isConversationEventsRequestUrl('/conversation-events/publish'), true);
    assert.equal(isConversationEventsRequestUrl('/'), false);
    assert.equal(isConversationEventsRequestUrl(undefined), false);
});

test('ConversationEventBus delivers only to sockets subscribed to that conversation', () => {
    const bus = new ConversationEventBus();
    const inRoom = new FakeSocket();
    const otherRoom = new FakeSocket();

    bus.subscribe('conv-1', inRoom as never);
    bus.subscribe('conv-2', otherRoom as never);
    bus.publish('conv-1', 'msg-1');

    assert.deepEqual(inRoom.sent, [JSON.stringify({ type: 'message', conversationId: 'conv-1', messageId: 'msg-1' })]);
    assert.deepEqual(otherRoom.sent, []);
});

test('ConversationEventBus skips a socket that is not open, and cleans up empty rooms', () => {
    const bus = new ConversationEventBus();
    const closedSocket = new FakeSocket();
    closedSocket.readyState = 3;

    bus.subscribe('conv-1', closedSocket as never);
    bus.publish('conv-1', 'msg-1');
    assert.deepEqual(closedSocket.sent, []);

    bus.unsubscribe('conv-1', closedSocket as never);
    assert.equal(bus.subscriberCount('conv-1'), 0);
});

test('handleConversationEventsConnection subscribes on a valid token and unsubscribes on close', () => {
    const bus = new ConversationEventBus();
    const socket = new FakeSocket();
    const token = signRealtimeToken({ conversationId: 'conv-1', userId: 'u1', exp: Date.now() + 60_000 }, SECRET);

    handleConversationEventsConnection(socket as never, `/conversation-events?token=${token}`, SECRET, bus);
    assert.equal(bus.subscriberCount('conv-1'), 1);

    socket.emit('close');
    assert.equal(bus.subscriberCount('conv-1'), 0);
});

test('handleConversationEventsConnection rejects a missing or invalid token', () => {
    const bus = new ConversationEventBus();
    const socket = new FakeSocket();
    let closeCode: number | undefined;
    socket.close = ((code: number) => { closeCode = code; }) as never;

    handleConversationEventsConnection(socket as never, '/conversation-events', SECRET, bus);

    assert.equal(closeCode, 4401);
    assert.equal(bus.subscriberCount('conv-1'), 0);
});

function fakeResponse() {
    const state = { status: 0, body: '' };
    const response = {
        writeHead: (status: number) => { state.status = status; },
        end: (body?: string) => { state.body = body ?? ''; },
    };
    return { response: response as unknown as ServerResponse, state };
}

function fakeRequest(body: string, authorization?: string): IncomingMessage {
    const request = new EventEmitter() as unknown as IncomingMessage;
    (request as unknown as { headers: Record<string, string> }).headers = authorization
        ? { authorization }
        : {};
    queueMicrotask(() => {
        request.emit('data', Buffer.from(body, 'utf8'));
        request.emit('end');
    });
    return request;
}

test('handleConversationEventsPublish rejects a wrong or missing bearer secret', async () => {
    const bus = new ConversationEventBus();
    const { response, state } = fakeResponse();

    await handleConversationEventsPublish(
        fakeRequest('{}', 'Bearer wrong'),
        response,
        SECRET,
        bus,
    );

    assert.equal(state.status, 401);
});

test('handleConversationEventsPublish rejects invalid JSON and missing fields', async () => {
    const bus = new ConversationEventBus();

    const { response: badJsonResponse, state: badJsonState } = fakeResponse();
    await handleConversationEventsPublish(fakeRequest('not json', `Bearer ${SECRET}`), badJsonResponse, SECRET, bus);
    assert.equal(badJsonState.status, 400);

    const { response: missingFieldResponse, state: missingFieldState } = fakeResponse();
    await handleConversationEventsPublish(
        fakeRequest(JSON.stringify({ conversationId: 'conv-1' }), `Bearer ${SECRET}`),
        missingFieldResponse,
        SECRET,
        bus,
    );
    assert.equal(missingFieldState.status, 400);
});

test('handleConversationEventsPublish broadcasts to subscribers on a valid request', async () => {
    const bus = new ConversationEventBus();
    const socket = new FakeSocket();
    bus.subscribe('conv-1', socket as never);
    const { response, state } = fakeResponse();

    await handleConversationEventsPublish(
        fakeRequest(JSON.stringify({ conversationId: 'conv-1', messageId: 'msg-1' }), `Bearer ${SECRET}`),
        response,
        SECRET,
        bus,
    );

    assert.equal(state.status, 204);
    assert.deepEqual(socket.sent, [JSON.stringify({ type: 'message', conversationId: 'conv-1', messageId: 'msg-1' })]);
});

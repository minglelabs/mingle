import test from 'node:test';
import assert from 'node:assert/strict';
import { once, EventEmitter } from 'node:events';
import { createHmac } from 'node:crypto';
import WebSocket, { WebSocketServer } from 'ws';
import { ConversationEventBus, handleConversationEventsConnection } from '../conversation-events';
import { LiveUtterances } from '../live-utterances';

const secret = 'isolated-live-test';
const writer = { sessionKey: 'room', userId: 'alice', exp: Date.now() + 60_000, liveWriter: { name: 'Alice' } };
function token(value: object) {
    const body = Buffer.from(JSON.stringify(value)).toString('base64url');
    return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}

test('two real sockets deliver a partial before finalization, then the committed message, without notifying legacy/other rooms', { timeout: 5000 }, async () => {
    const bus = new ConversationEventBus();
    const server = new WebSocketServer({ port: 0 });
    server.on('connection', (socket, request) => handleConversationEventsConnection(socket, request.url, secret, bus));
    await once(server, 'listening');
    const address = server.address() as { port: number };
    const clients: WebSocket[] = [];
    const connect = async (userId: string, sessionKey = 'room', live = true) => {
        const ws = new WebSocket(`ws://127.0.0.1:${address.port}/conversation-events?token=${token({ userId, sessionKey, exp: Date.now() + 60_000, liveReader: live })}${live ? '&live=1' : ''}`);
        clients.push(ws);
        await once(ws, 'open');
        return ws;
    };
    try {
        const sender = await connect('alice');
        const receiver = await connect('bob');
        const legacy = await connect('bob', 'room', false);
        const other = await connect('charlie', 'another-room');
        const legacyMessages: unknown[] = [], otherMessages: unknown[] = [];
        legacy.on('message', data => legacyMessages.push(JSON.parse(data.toString())));
        other.on('message', data => otherMessages.push(JSON.parse(data.toString())));
        const first = once(receiver, 'message');
        const started = Date.now();
        sender.send(JSON.stringify({ type: 'utterance_preview', writerToken: token(writer), id: 'voice-1', sequence: 1,
            originalText: 'still speaking', originalLang: 'en', speakerUserId: 'victim', sessionKey: 'another-room' }));
        const frame = JSON.parse((await first)[0].toString());
        assert.equal(frame.type, 'utterance_preview');
        assert.equal(frame.final, false);
        assert.equal(frame.utterance.originalText, 'still speaking');
        assert.equal(frame.utterance.speakerUserId, 'alice');
        assert.equal(frame.sessionKey, 'room');
        assert.ok(Date.now() - started < 1000);
        assert.deepEqual(legacyMessages, []);
        assert.deepEqual(otherMessages, []);
        const committed = once(receiver, 'message');
        const legacyCommit = once(legacy, 'message');
        bus.publish('room', { ...frame.utterance, originalText: 'finished speaking', translations: { ko: '말하기 완료' }, serverMessageId: 'db-1' });
        const complete = JSON.parse((await committed)[0].toString());
        assert.equal(complete.type, 'utterance_committed');
        assert.equal(complete.utterance.id, frame.utterance.id);
        assert.equal(complete.utterance.translations.ko, '말하기 완료');
        assert.deepEqual(JSON.parse((await legacyCommit)[0].toString()), { type: 'message', sessionKey: 'room' });
        assert.equal(bus.liveUtterances.accept({ id: 'voice-1', sequence: 2, originalText: 'stale partial' }, writer), null);
        assert.deepEqual(otherMessages, []);
    } finally {
        for (const ws of clients) ws.terminate();
        for (const ws of server.clients) ws.terminate();
        await new Promise<void>(resolve => server.close(() => resolve()));
    }
});

test('live subscriptions expire, cannot renew into another account and legacy tokens cannot upgrade themselves', { timeout: 2000 }, async () => {
    class Socket extends EventEmitter {
        OPEN = 1;
        readyState = 1;
        bufferedAmount = 0;
        messages: Record<string, unknown>[] = [];
        send(data: string) { this.messages.push(JSON.parse(data)); }
        close(code: number) { this.readyState = 3; this.emit('close', code); }
    }
    const bus = new ConversationEventBus();
    const legacy = new Socket();
    handleConversationEventsConnection(legacy as unknown as WebSocket,
        `/conversation-events?live=1&token=${token({ ...writer, liveWriter: undefined })}`, secret, bus);
    bus.publish('room', { id: 'persisted', speakerUserId: 'alice' });
    assert.equal(legacy.messages[0].type, 'message');
    const socket = new Socket();
    handleConversationEventsConnection(socket as unknown as WebSocket,
        `/conversation-events?live=1&token=${token({ ...writer, liveWriter: undefined, liveReader: true, exp: Date.now() + 100 })}`, secret, bus);
    socket.emit('message', Buffer.from(JSON.stringify({ type: 'utterance_preview', writerToken: token({ ...writer, userId: 'bob' }),
        id: 'forged', sequence: 1, originalText: 'spoof' })), false);
    assert.deepEqual(socket.messages, []);
    socket.emit('message', Buffer.from(JSON.stringify({ type: 'renew', token: token({ ...writer, userId: 'bob', liveReader: true }) })), false);
    const closed = once(socket, 'close');
    // Keep the test alive while the production expiry timer remains unref'ed.
    const keepAlive = setTimeout(() => {}, 1000);
    try { assert.equal((await closed)[0], 4401); } finally { clearTimeout(keepAlive); legacy.close(1000); }
    assert.equal(bus.subscriberCount('room'), 0);
});

test('a commit fences late previews even while no room socket is connected', () => {
    const bus = new ConversationEventBus();
    bus.publish('room', { id: 'offline-commit', speakerUserId: 'alice' });
    assert.equal(bus.liveUtterances.accept({ id: 'offline-commit', originalText: 'late', sequence: 9 }, writer), null);
});

test('writer capability, expiry, sequence and finalization protect ephemeral turns', () => {
    const turns = new LiveUtterances();
    const input = { id: 'voice', originalText: 'hello', sequence: 1 };
    assert.equal(turns.accept(input, { ...writer, liveWriter: undefined }), null);
    assert.equal(turns.accept(input, { ...writer, sessionKey: 'list:alice' }), null);
    assert.equal(turns.accept(input, { ...writer, exp: Date.now() - 1 }), null);
    assert.equal(turns.accept({ ...input, originalText: 'x'.repeat(20001) }, writer), null);
    const initial = turns.accept(input, writer, secret)!;
    const final = turns.accept({ ...input, sequence: 2, final: true, originalText: 'hello world' }, writer)!;
    assert.equal(initial.utterance.createdAtMs, final.utterance.createdAtMs);
    assert.equal(turns.accept({ ...input, sequence: 3 }, writer), null);
    assert.equal(turns.accept({ ...input, sequence: 1, final: true }, writer), null);
    assert.ok(initial.orderReceipt);
});

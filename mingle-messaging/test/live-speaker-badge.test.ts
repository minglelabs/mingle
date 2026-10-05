import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createHmac } from 'node:crypto';
import WebSocket, { WebSocketServer } from 'ws';
import { ConversationEventBus, handleConversationEventsConnection } from '../conversation-events';
import { LiveUtterances } from '../live-utterances';
import type { RealtimeTokenPayload } from '../realtime-token';

// The writer token's `liveWriter.badge` (signed by mingle-app from the
// sender's own account flags) labels live previews as `speakerBadge`, so a
// Mingle-run account's in-progress speech is never shown unlabeled.

const secret = 'speaker-badge-test';
const base = { sessionKey: 'room', userId: 'mina', exp: Date.now() + 60_000 };
const operatorWriter: RealtimeTokenPayload = { ...base, liveWriter: { name: 'Mina', badge: 'operator' } };
const plainWriter: RealtimeTokenPayload = { ...base, userId: 'bob', liveWriter: { name: 'Bob' } };

function token(value: object) {
    const body = Buffer.from(JSON.stringify(value)).toString('base64url');
    return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}

test('a preview carries the badge signed into the writer token, and only that one', () => {
    const live = new LiveUtterances();
    const labeled = live.accept({ id: 'op-1', originalText: 'hello', sequence: 1 }, operatorWriter)!;
    assert.equal(labeled.utterance.speakerBadge, 'operator');
    assert.equal(labeled.utterance.speakerName, 'Mina');

    const official = live.accept({ id: 'team-1', originalText: 'hello', sequence: 1 },
        { ...base, userId: 'team', liveWriter: { name: 'Mingle', badge: 'official' } })!;
    assert.equal(official.utterance.speakerBadge, 'official');

    const plain = live.accept({ id: 'bob-1', originalText: 'hello', sequence: 1 }, plainWriter)!;
    assert.equal('speakerBadge' in plain.utterance, false);
});

test('a client cannot choose its own badge through the frame, and unknown claim values are dropped', () => {
    const live = new LiveUtterances();
    const spoofed = live.accept({ id: 'bob-2', originalText: 'hi', sequence: 1, speakerBadge: 'official' }, plainWriter)!;
    assert.equal('speakerBadge' in spoofed.utterance, false);

    const cannotHide = live.accept({ id: 'op-2', originalText: 'hi', sequence: 1, speakerBadge: null }, operatorWriter)!;
    assert.equal(cannotHide.utterance.speakerBadge, 'operator');

    const garbage = live.accept({ id: 'odd-1', originalText: 'hi', sequence: 1 },
        { ...base, userId: 'odd', liveWriter: { name: 'Odd', badge: 'admin' as unknown as 'operator' } })!;
    assert.equal('speakerBadge' in garbage.utterance, false);
});

test('over real sockets the receiver sees the labeled preview, then the committed speakerBadge untouched', { timeout: 5000 }, async () => {
    const bus = new ConversationEventBus();
    const server = new WebSocketServer({ port: 0 });
    server.on('connection', (socket, request) => handleConversationEventsConnection(socket, request.url, secret, bus));
    await once(server, 'listening');
    const { port } = server.address() as { port: number };
    const clients: WebSocket[] = [];
    const connect = async (userId: string) => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}/conversation-events?token=${token({ userId, sessionKey: 'room', exp: Date.now() + 60_000, liveReader: true })}&live=1`);
        clients.push(ws);
        await once(ws, 'open');
        return ws;
    };
    try {
        const sender = await connect('mina');
        const receiver = await connect('viewer');
        const preview = once(receiver, 'message');
        sender.send(JSON.stringify({ type: 'utterance_preview', writerToken: token(operatorWriter), id: 'voice-op', sequence: 1,
            originalText: 'still speaking', originalLang: 'en', speakerBadge: 'official' }));
        const frame = JSON.parse((await preview)[0].toString());
        assert.equal(frame.type, 'utterance_preview');
        assert.equal(frame.utterance.speakerUserId, 'mina');
        assert.equal(frame.utterance.speakerBadge, 'operator');

        const committed = once(receiver, 'message');
        bus.publish('room', { ...frame.utterance, originalText: 'done', serverMessageId: 'db-1', speakerBadge: 'operator' });
        const complete = JSON.parse((await committed)[0].toString());
        assert.equal(complete.type, 'utterance_committed');
        assert.equal(complete.utterance.speakerBadge, 'operator');
    } finally {
        for (const ws of clients) ws.terminate();
        for (const ws of server.clients) ws.terminate();
        await new Promise<void>(resolve => server.close(() => resolve()));
    }
});

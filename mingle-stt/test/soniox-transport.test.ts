import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, type Server } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import { WebSocket, WebSocketServer } from 'ws';
import { createSttServer } from '../stt-server';
import { SonioxAudioRelay, type SonioxStreamFailure } from '../soniox-audio-relay';

async function listen(server: Server): Promise<string> {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    return `ws://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function waitFor(predicate: () => boolean): Promise<void> {
    const deadline = Date.now() + 2_000;
    while (!predicate()) {
        if (Date.now() >= deadline) throw new Error('Timed out waiting for test transport');
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
}

async function fixture(t: TestContext, options: {
    delayHandshake?: boolean;
    handshakeTimeoutMs?: number;
    timing?: { keepaliveIntervalMs: number; firstAudioTimeoutMs: number; audioIdleTimeoutMs: number };
} = {}) {
    const providerServer = createServer();
    const providerConnectionsToClose = new Set<Socket>();
    providerServer.on('connection', (socket) => {
        providerConnectionsToClose.add(socket);
        socket.on('close', () => providerConnectionsToClose.delete(socket));
    });
    let acceptHandshake: (() => void) | null = null;
    const providerWss = new WebSocketServer({
        server: providerServer,
        verifyClient: options.delayHandshake ? ((_info, callback) => {
            acceptHandshake = () => callback(true);
        }) : undefined,
    });
    const providerFrames: { binary: boolean; data: Buffer }[] = [];
    let providerSocket: WebSocket | null = null;
    let providerConnections = 0;
    providerWss.on('connection', (socket) => {
        providerConnections += 1;
        providerSocket = socket;
        socket.on('message', (data, binary) => providerFrames.push({ binary, data: Buffer.from(data as Buffer) }));
    });
    const sonioxUrl = await listen(providerServer);
    const { server, wss } = createSttServer({
        sonioxUrl, sonioxApiKey: 'test-only-key',
        sonioxHandshakeTimeoutMs: options.handshakeTimeoutMs,
        sonioxRelayTiming: options.timing,
    });
    let receivedClientMessages = 0;
    wss.on('connection', (socket) => socket.on('message', () => receivedClientMessages += 1));
    const client = new WebSocket(await listen(server));
    const messages: any[] = [];
    client.on('message', (data) => messages.push(JSON.parse(data.toString())));
    let closeCode: number | null = null;
    client.on('close', (code) => closeCode = code);
    t.after(async () => {
        client.terminate();
        for (const socket of wss.clients) socket.terminate();
        for (const socket of providerWss.clients) socket.terminate();
        for (const socket of providerConnectionsToClose) socket.destroy();
        await Promise.all([
            new Promise<void>((resolve) => wss.close(() => resolve())),
            new Promise<void>((resolve) => providerWss.close(() => resolve())),
            new Promise<void>((resolve) => server.close(() => resolve())),
            new Promise<void>((resolve) => providerServer.close(() => resolve())),
        ]);
    });
    await once(client, 'open');
    const sendConfig = () => client.send(JSON.stringify({
        stt_model: 'soniox', sample_rate: 16_000, api_namespace: 'ios/v2.0.3',
        soniox_language_hints: ['ko', 'en'], stt_segmentation_mode: 'end',
    }));
    return {
        client, messages, providerFrames, sendConfig,
        get providerSocket() { return providerSocket!; },
        get closeCode() { return closeCode; },
        get providerConnections() { return providerConnections; },
        get receivedClientMessages() { return receivedClientMessages; },
        async accept() {
            await waitFor(() => acceptHandshake !== null);
            acceptHandshake!();
        },
        async ready() {
            await waitFor(() => messages.some((msg) => msg.status === 'ready'));
        },
        audio(chunk: Buffer) {
            client.send(JSON.stringify({ type: 'audio_chunk', data: { chunk: chunk.toString('base64') } }));
        },
    };
}

test('startup audio is delivered in order after config, including all-zero PCM', async (t) => {
    const f = await fixture(t, { delayHandshake: true });
    f.sendConfig();
    const chunks = [Buffer.alloc(320), Buffer.from([1, 2, 3, 4])];
    chunks.forEach((chunk) => f.audio(chunk));
    await waitFor(() => f.receivedClientMessages === 3);
    assert.equal(f.providerFrames.length, 0);
    await f.accept();
    await f.ready();
    await waitFor(() => f.providerFrames.length === 3);
    assert.equal(f.providerFrames[0].binary, false);
    assert.equal(JSON.parse(f.providerFrames[0].data.toString()).sample_rate, 16_000);
    assert.deepEqual(f.providerFrames.slice(1).map((frame) => frame.data), chunks);
    assert.ok(f.providerFrames.slice(1).every((frame) => frame.binary));
    f.sendConfig();
    f.audio(Buffer.from([5, 6]));
    await waitFor(() => f.providerFrames.length === 4);
    assert.equal(f.providerConnections, 1);
});

test('408 flushes partial speech, sends one error and closes without waiting for Soniox', async (t) => {
    const f = await fixture(t);
    f.sendConfig();
    await f.ready();
    f.audio(Buffer.alloc(320));
    f.providerSocket.send(JSON.stringify({ tokens: [{ text: 'hello', language: 'en', speaker: '1', is_final: false }] }));
    await waitFor(() => f.messages.some((msg) => msg.type === 'transcript'));
    const beforeError = Date.now();
    // Deliberately keep the mock upstream open after this terminal error.
    f.providerSocket.send(JSON.stringify({
        error_code: 408, error_type: 'request_timeout', error_message: 'Request timeout.', request_id: 'test-408',
    }));
    await waitFor(() => f.closeCode !== null);
    assert.equal(f.closeCode, 1011);
    assert.ok(Date.now() - beforeError < 1_000);
    const finals = f.messages.filter((msg) => msg.type === 'transcript' && msg.data.is_final);
    assert.equal(finals.length, 1);
    assert.equal(finals[0].data.utterance.text, 'hello');
    const errors = f.messages.filter((msg) => msg.type === 'error');
    assert.equal(errors.length, 1);
    assert.equal(errors[0].error_code, '408');
    assert.equal(errors[0].request_id, 'test-408');
    assert.ok(f.messages.indexOf(finals[0]) < f.messages.indexOf(errors[0]));
});

test('upstream disconnect also preserves partial speech and reports failure', async (t) => {
    const f = await fixture(t);
    f.sendConfig();
    await f.ready();
    f.providerSocket.send(JSON.stringify({ tokens: [{ text: 'partial', is_final: false }] }));
    await waitFor(() => f.messages.some((msg) => msg.type === 'transcript'));
    f.providerSocket.terminate();
    await waitFor(() => f.closeCode !== null);
    assert.equal(f.closeCode, 1011);
    assert.equal(f.messages.filter((msg) => msg.type === 'transcript' && msg.data.is_final).length, 1);
    assert.equal(f.messages.find((msg) => msg.type === 'error').error_type, 'upstream_closed');
});

test('a stalled provider handshake fails within the configured deadline', async (t) => {
    const f = await fixture(t, { delayHandshake: true, handshakeTimeoutMs: 50 });
    f.sendConfig();
    f.audio(Buffer.alloc(320));
    await waitFor(() => f.closeCode !== null);
    assert.equal(f.closeCode, 1011);
    assert.equal(f.messages.find((msg) => msg.type === 'error').error_type, 'upstream_connection_error');
    assert.ok(!f.messages.some((msg) => msg.status === 'ready'));
});

test('Stop during handshake acknowledges once and never sends ready or queued audio', async (t) => {
    const f = await fixture(t, { delayHandshake: true });
    f.sendConfig();
    f.audio(Buffer.alloc(320));
    const stop = JSON.stringify({ type: 'stop_recording' });
    f.client.send(stop);
    f.client.send(stop);
    await waitFor(() => f.closeCode !== null);
    assert.equal(f.messages.filter((msg) => msg.type === 'stop_recording_ack').length, 1);
    assert.ok(!f.messages.some((msg) => msg.status === 'ready' || msg.type === 'error'));
    assert.equal(f.providerFrames.length, 0);
});

test('Stop still finalizes previously forwarded audio and acknowledges after the transcript', async (t) => {
    const f = await fixture(t);
    f.sendConfig();
    await f.ready();
    f.audio(Buffer.alloc(320));
    await waitFor(() => f.providerFrames.some((frame) => frame.binary));
    f.providerSocket.on('message', (data, binary) => {
        if (!binary && JSON.parse(data.toString()).type === 'finalize') {
            f.providerSocket.send(JSON.stringify({ tokens: [
                { text: 'last words', language: 'en', is_final: true },
                { text: '<fin>', is_final: true },
            ] }));
        }
    });
    f.client.send(JSON.stringify({ type: 'stop_recording' }));
    await waitFor(() => f.closeCode !== null);
    const final = f.messages.find((msg) => msg.type === 'transcript' && msg.data.is_final);
    const ack = f.messages.find((msg) => msg.type === 'stop_recording_ack');
    assert.equal(final.data.utterance.text, 'last words');
    assert.equal(ack.data.finalized, true);
    assert.ok(f.messages.indexOf(final) < f.messages.indexOf(ack));
    assert.ok(!f.messages.some((msg) => msg.type === 'error'));
});

test('keepalive bridges short audio gaps but no-audio clients are stopped', async (t) => {
    const f = await fixture(t, { timing: { keepaliveIntervalMs: 10, firstAudioTimeoutMs: 80, audioIdleTimeoutMs: 100 } });
    f.sendConfig();
    await f.ready();
    await waitFor(() => f.providerFrames.some((frame) => !frame.binary && JSON.parse(frame.data.toString()).type === 'keepalive'));
    f.audio(Buffer.alloc(320));
    await waitFor(() => f.providerFrames.some((frame) => frame.binary));
    assert.equal(f.closeCode, null);
    await waitFor(() => f.closeCode !== null);
    assert.equal(f.messages.find((msg) => msg.type === 'error').error_type, 'audio_input_timeout');
});

test('a provider error during Stop preserves the final turn and lets Stop acknowledge', async (t) => {
    const f = await fixture(t);
    f.sendConfig();
    await f.ready();
    f.audio(Buffer.alloc(320));
    f.providerSocket.send(JSON.stringify({ tokens: [{ text: 'pending', language: 'en', is_final: false }] }));
    await waitFor(() => f.messages.some((msg) => msg.type === 'transcript'));
    f.providerSocket.on('message', (data, binary) => {
        if (!binary && JSON.parse(data.toString()).type === 'finalize') {
            f.providerSocket.send(JSON.stringify({ error_code: 408, error_message: 'Request timeout.' }));
        }
    });
    f.client.send(JSON.stringify({ type: 'stop_recording' }));
    await waitFor(() => f.closeCode !== null);
    assert.equal(f.messages.filter((msg) => msg.type === 'transcript' && msg.data.is_final).length, 1);
    assert.equal(f.messages.filter((msg) => msg.type === 'stop_recording_ack').length, 1);
    assert.ok(!f.messages.some((msg) => msg.type === 'error'));
});

test('client disconnect during handshake disposes its queued audio and never becomes ready', async (t) => {
    const f = await fixture(t, { delayHandshake: true });
    f.sendConfig();
    f.audio(Buffer.alloc(320));
    await waitFor(() => f.receivedClientMessages === 2);
    f.client.close(1000);
    await waitFor(() => f.closeCode !== null);
    assert.equal(f.providerFrames.length, 0);
    assert.ok(!f.messages.some((msg) => msg.status === 'ready'));
});

test('a client that never sends its first audio is not kept alive indefinitely', async (t) => {
    const f = await fixture(t, { timing: { keepaliveIntervalMs: 10, firstAudioTimeoutMs: 60, audioIdleTimeoutMs: 200 } });
    f.sendConfig();
    await waitFor(() => f.closeCode !== null);
    assert.equal(f.messages.find((msg) => msg.type === 'error').error_code, '408');
    assert.equal(f.messages.find((msg) => msg.type === 'error').error_type, 'audio_input_timeout');
    assert.ok(!f.providerFrames.some((frame) => frame.binary));
});

test('startup buffer overflow closes the stream instead of dropping early audio', async (t) => {
    const f = await fixture(t, { delayHandshake: true });
    f.sendConfig();
    f.audio(Buffer.alloc(16_000 * 2 * 5 + 1));
    await waitFor(() => f.closeCode !== null);
    assert.equal(f.messages.find((msg) => msg.type === 'error').error_type, 'audio_buffer_overflow');
});

test('send backpressure and async send errors are terminal and empty chunks are ignored', () => {
    const failures: SonioxStreamFailure[] = [];
    const callbacks: ((error?: Error) => void)[] = [];
    const socket = {
        readyState: WebSocket.OPEN, bufferedAmount: 0,
        send: (_data: unknown, callback: (error?: Error) => void) => callbacks.push(callback),
    } as unknown as WebSocket;
    const relay = new SonioxAudioRelay(socket, 16_000, (failure) => failures.push(failure));
    assert.equal(relay.start(), true);
    relay.receive(Buffer.alloc(0));
    assert.equal(callbacks.length, 0);
    relay.receive(Buffer.alloc(320));
    callbacks[0](new Error('send failed'));
    relay.receive(Buffer.alloc(320));
    assert.equal(callbacks.length, 1);
    assert.equal(failures.length, 1);
    assert.equal(failures[0].category, 'upstream_send_error');
    const blockedSocket = { readyState: WebSocket.OPEN, bufferedAmount: 160_000 } as WebSocket;
    const blockedRelay = new SonioxAudioRelay(blockedSocket, 16_000, (failure) => failures.push(failure));
    blockedRelay.start();
    blockedRelay.receive(Buffer.alloc(320));
    assert.equal(failures[1].category, 'audio_backpressure');
});

import type { IncomingMessage, ServerResponse } from 'http';
import type { WebSocket } from 'ws';
import { verifyRealtimeToken } from './realtime-token';
import { LiveUtterances } from './live-utterances';

/**
 * In-memory fan-out for conversation and conversation-list notifications.
 * The app owns persistence and authorization; this service only owns live
 * WebSocket connections, ephemeral speech previews and committed message fan-out.
 * Legacy subscribers continue to receive small invalidation events only.
 */
export class ConversationEventBus {
    private readonly subscribers = new Map<string, Set<WebSocket>>();
    private readonly liveSubscribers = new WeakSet<WebSocket>();
    readonly liveUtterances = new LiveUtterances();

    enableLive(socket: WebSocket): void { this.liveSubscribers.add(socket); }

    publishLive(sessionKey: string, event: unknown): void {
        const payload = JSON.stringify(event);
        for (const socket of this.subscribers.get(sessionKey) ?? []) {
            if (this.liveSubscribers.has(socket) && socket.readyState === socket.OPEN && socket.bufferedAmount < 256_000) socket.send(payload);
        }
    }

    subscribe(sessionKey: string, socket: WebSocket): void {
        let sockets = this.subscribers.get(sessionKey);
        if (!sockets) {
            sockets = new Set();
            this.subscribers.set(sessionKey, sockets);
        }
        sockets.add(socket);
    }

    unsubscribe(sessionKey: string, socket: WebSocket): void {
        const sockets = this.subscribers.get(sessionKey);
        if (!sockets) return;
        sockets.delete(socket);
        if (sockets.size === 0) this.subscribers.delete(sessionKey);
    }

    /** Number of sockets currently watching a topic. Test/debug only. */
    subscriberCount(sessionKey: string): number {
        return this.subscribers.get(sessionKey)?.size ?? 0;
    }

    publish(sessionKey: string, utterance?: Record<string, unknown>): void {
        if (utterance && typeof utterance.id === 'string' && typeof utterance.speakerUserId === 'string') {
            this.liveUtterances.commit(sessionKey, utterance.speakerUserId, utterance.id);
        }
        const sockets = this.subscribers.get(sessionKey);
        if (!sockets || sockets.size === 0) return;

        const payload = JSON.stringify({ type: 'message', sessionKey });
        const messagePayload = utterance ? JSON.stringify({ type: 'utterance_committed', sessionKey, utterance }) : null;
        for (const socket of sockets) {
            if (socket.readyState !== socket.OPEN) continue;
            socket.send(messagePayload && this.liveSubscribers.has(socket) ? messagePayload : payload);
        }
    }
}

export const CONVERSATION_EVENTS_WS_PATH = '/conversation-events';
export const CONVERSATION_EVENTS_PUBLISH_PATH = '/conversation-events/publish';

/** True for either conversation-events endpoint. */
export function isConversationEventsRequestUrl(rawUrl: string | undefined): boolean {
    if (!rawUrl) return false;
    const path = rawUrl.split('?')[0];
    return path === CONVERSATION_EVENTS_WS_PATH || path === CONVERSATION_EVENTS_PUBLISH_PATH;
}

/**
 * Handles a WebSocket connection already routed to `/conversation-events`.
 * The token is minted by mingle-app after checking channel membership.
 */
export function handleConversationEventsConnection(
    socket: WebSocket,
    requestUrl: string | undefined,
    secret: string,
    bus: ConversationEventBus,
): void {
    const token = new URL(requestUrl || '', 'http://internal').searchParams.get('token') || '';
    let payload = token ? verifyRealtimeToken(token, secret) : null;

    if (!payload) {
        socket.close(4401, 'invalid_token');
        return;
    }

    bus.subscribe(payload.sessionKey, socket);
    const sessionKey = payload.sessionKey;
    const userId = payload.userId;
    const live = payload.liveReader === true && new URL(requestUrl || '', 'http://internal').searchParams.get('live') === '1';
    let expiryTimer: ReturnType<typeof setTimeout> | undefined;
    const expire = () => {
        if (expiryTimer) clearTimeout(expiryTimer);
        expiryTimer = setTimeout(() => { bus.unsubscribe(sessionKey, socket); socket.close(4401, 'expired_token'); }, Math.max(1, payload!.exp - Date.now()));
        expiryTimer.unref();
    };
    if (live) { bus.enableLive(socket); expire(); }
    const cleanup = () => { if (expiryTimer) clearTimeout(expiryTimer); bus.unsubscribe(sessionKey, socket); };
    socket.on('close', cleanup);
    socket.on('error', cleanup);
    let lastFrameAt = 0;
    socket.on('message', (raw, binary) => {
        if (!live || binary || Buffer.byteLength(raw.toString()) > 256_000) return;
        let input: Record<string, unknown>;
        try { input = JSON.parse(raw.toString()); } catch { return; }
        if (!input || typeof input !== 'object') return;
        if (input.type === 'renew' && typeof input.token === 'string') {
            const next = verifyRealtimeToken(input.token, secret);
            if (next?.liveReader === true && next.sessionKey === sessionKey && next.userId === userId) { payload = next; expire(); }
            return;
        }
        if (payload!.exp <= Date.now() || input.type !== 'utterance_preview' || Date.now() - lastFrameAt < 80) return;
        lastFrameAt = Date.now();
        const writer = typeof input.writerToken === 'string' ? verifyRealtimeToken(input.writerToken, secret) : null;
        if (!writer || writer.sessionKey !== sessionKey || writer.userId !== userId) return;
        const frame = bus.liveUtterances.accept(input, writer, secret);
        if (frame) bus.publishLive(sessionKey, frame);
    });
}

function readRequestBody(request: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        request.on('data', (chunk: Buffer) => chunks.push(chunk));
        request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        request.on('error', reject);
    });
}

/**
 * Handles the service-to-service publish request from mingle-app after a
 * message commits. Contents are delivered to upgraded room subscribers only;
 * list and legacy subscribers receive invalidations. Persistence stays in app.
 */
export async function handleConversationEventsPublish(
    request: IncomingMessage,
    response: ServerResponse,
    secret: string,
    bus: ConversationEventBus,
): Promise<void> {
    const authorization = request.headers.authorization || '';
    const providedSecret = authorization.startsWith('Bearer ')
        ? authorization.slice('Bearer '.length).trim()
        : '';
    const normalizedSecret = secret.trim();
    if (!normalizedSecret || providedSecret !== normalizedSecret) {
        response.writeHead(401, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: 'unauthorized' }));
        return;
    }

    let body: unknown;
    try {
        body = JSON.parse(await readRequestBody(request));
    } catch {
        response.writeHead(400, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: 'invalid_json' }));
        return;
    }

    const record = body as Record<string, unknown>;
    const sessionKey = typeof record?.sessionKey === 'string' ? record.sessionKey.trim() : '';
    const extraKeys = Array.isArray(record?.keys)
        ? record.keys
            .filter((key): key is string => typeof key === 'string' && key.trim() !== '')
            .map((key) => key.trim())
        : [];
    const keys = [...new Set(sessionKey ? [sessionKey, ...extraKeys] : extraKeys)];

    if (keys.length === 0) {
        response.writeHead(400, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: 'invalid_payload' }));
        return;
    }

    const utterance = record.utterance && typeof record.utterance === 'object' && !Array.isArray(record.utterance)
        ? record.utterance as Record<string, unknown> : undefined;
    for (const key of keys) {
        // Full content is room-scoped. List subscriptions still get only their
        // usual invalidation, not another room's contents or live partials.
        bus.publish(key, key === sessionKey ? utterance : undefined);
    }
    response.writeHead(204);
    response.end();
}

import type { IncomingMessage, ServerResponse } from 'http';
import type { WebSocket } from 'ws';
import { verifyRealtimeToken } from './realtime-token';

/**
 * In-memory fan-out for conversation and conversation-list notifications.
 * The app owns persistence and authorization; this service only owns live
 * WebSocket connections and publishes a small invalidation event.
 */
export class ConversationEventBus {
    private readonly subscribers = new Map<string, Set<WebSocket>>();

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

    publish(sessionKey: string): void {
        const sockets = this.subscribers.get(sessionKey);
        if (!sockets || sockets.size === 0) return;

        const payload = JSON.stringify({ type: 'message', sessionKey });
        for (const socket of sockets) {
            if (socket.readyState !== socket.OPEN) continue;
            socket.send(payload);
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
    const payload = token ? verifyRealtimeToken(token, secret) : null;

    if (!payload) {
        socket.close(4401, 'invalid_token');
        return;
    }

    bus.subscribe(payload.sessionKey, socket);
    socket.on('close', () => bus.unsubscribe(payload.sessionKey, socket));
    socket.on('error', () => bus.unsubscribe(payload.sessionKey, socket));
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
 * message commits. The messaging service never receives or stores message
 * contents; it only fans out invalidation events to subscribed topics.
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

    for (const key of keys) {
        bus.publish(key);
    }
    response.writeHead(204);
    response.end();
}

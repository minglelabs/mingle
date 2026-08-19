import type { IncomingMessage, ServerResponse } from 'http';
import type { WebSocket } from 'ws';
import { verifyRealtimeToken } from './realtime-token';

/**
 * Push delivery for direct-message conversations. mingle-app is serverless
 * (Vercel) and cannot hold a WebSocket open, so this in-memory fan-out lives
 * here instead, next to the STT relay's own persistent connection — the one
 * piece of this stack that already runs as a long-lived process.
 *
 * State is intentionally process-local. A machine restart drops subscribers,
 * which is fine: the client's own polling fallback (see the DM thread hook)
 * catches whatever a dropped socket misses.
 */
export class ConversationEventBus {
    private readonly subscribers = new Map<string, Set<WebSocket>>();

    subscribe(conversationId: string, socket: WebSocket): void {
        let sockets = this.subscribers.get(conversationId);
        if (!sockets) {
            sockets = new Set();
            this.subscribers.set(conversationId, sockets);
        }
        sockets.add(socket);
    }

    unsubscribe(conversationId: string, socket: WebSocket): void {
        const sockets = this.subscribers.get(conversationId);
        if (!sockets) return;
        sockets.delete(socket);
        if (sockets.size === 0) this.subscribers.delete(conversationId);
    }

    /** Number of sockets currently watching a conversation. Test/debug only. */
    subscriberCount(conversationId: string): number {
        return this.subscribers.get(conversationId)?.size ?? 0;
    }

    publish(conversationId: string, messageId: string): void {
        const sockets = this.subscribers.get(conversationId);
        if (!sockets || sockets.size === 0) return;

        const payload = JSON.stringify({ type: 'message', conversationId, messageId });
        for (const socket of sockets) {
            if (socket.readyState !== socket.OPEN) continue;
            socket.send(payload);
        }
    }
}

export const CONVERSATION_EVENTS_WS_PATH = '/conversation-events';
export const CONVERSATION_EVENTS_PUBLISH_PATH = '/conversation-events/publish';

/** True for any request this module should be given a chance to handle. */
export function isConversationEventsRequestUrl(rawUrl: string | undefined): boolean {
    if (!rawUrl) return false;
    const path = rawUrl.split('?')[0];
    return path === CONVERSATION_EVENTS_WS_PATH || path === CONVERSATION_EVENTS_PUBLISH_PATH;
}

/**
 * Handles a WebSocket upgrade already routed to `/conversation-events`. The
 * token is mingle-app's word that this connection's holder is a real member
 * of `conversationId` — see realtime-token.ts for what "verifying" it means
 * on this side.
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

    bus.subscribe(payload.conversationId, socket);
    socket.on('close', () => bus.unsubscribe(payload.conversationId, socket));
    socket.on('error', () => bus.unsubscribe(payload.conversationId, socket));
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
 * Handles the plain-HTTP `POST /conversation-events/publish` mingle-app calls
 * right after a message commits. Authenticated with the same shared secret,
 * bearer-style — this is service-to-service, not a per-user token, since
 * mingle-app has already done the membership check by the time it calls this.
 */
export async function handleConversationEventsPublish(
    request: IncomingMessage,
    response: ServerResponse,
    secret: string,
    bus: ConversationEventBus,
): Promise<void> {
    const authorization = request.headers.authorization || '';
    const providedSecret = authorization.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : '';
    if (providedSecret !== secret) {
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

    const conversationId = typeof (body as Record<string, unknown>)?.conversationId === 'string'
        ? ((body as Record<string, unknown>).conversationId as string).trim()
        : '';
    const messageId = typeof (body as Record<string, unknown>)?.messageId === 'string'
        ? ((body as Record<string, unknown>).messageId as string).trim()
        : '';

    if (!conversationId || !messageId) {
        response.writeHead(400, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: 'invalid_payload' }));
        return;
    }

    bus.publish(conversationId, messageId);
    response.writeHead(204);
    response.end();
}

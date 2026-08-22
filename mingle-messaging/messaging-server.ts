import { createServer } from 'http';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { config as loadDotenv } from 'dotenv';
import { WebSocketServer } from 'ws';
import {
    ConversationEventBus,
    CONVERSATION_EVENTS_PUBLISH_PATH,
    CONVERSATION_EVENTS_WS_PATH,
    handleConversationEventsConnection,
    handleConversationEventsPublish,
} from './conversation-events';

for (const filename of ['.env.local', '.env']) {
    const fullPath = resolve(process.cwd(), filename);
    if (!existsSync(fullPath)) continue;
    loadDotenv({ path: fullPath, override: filename === '.env.local' });
}

const PORT = Number.parseInt(process.env.PORT || '3002', 10);
const REALTIME_SECRET = (process.env.MINGLE_REALTIME_SECRET || '').trim();
const HEALTH_PATH = '/health';
const eventBus = new ConversationEventBus();
const server = createServer((request, response) => {
    const path = request.url?.split('?')[0] || '/';

    if (request.method === 'GET' && path === HEALTH_PATH) {
        response.writeHead(200, {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
        });
        response.end(JSON.stringify({
            ok: true,
            realtimeConfigured: Boolean(REALTIME_SECRET),
            websocketPath: CONVERSATION_EVENTS_WS_PATH,
        }));
        return;
    }

    if (request.method === 'POST' && path === CONVERSATION_EVENTS_PUBLISH_PATH) {
        void handleConversationEventsPublish(request, response, REALTIME_SECRET, eventBus);
        return;
    }

    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'not_found' }));
});

const wss = new WebSocketServer({ server });
wss.on('connection', (socket, request) => {
    const path = request.url?.split('?')[0] || '';
    if (path !== CONVERSATION_EVENTS_WS_PATH) {
        socket.close(1008, 'not_found');
        return;
    }
    handleConversationEventsConnection(socket, request.url, REALTIME_SECRET, eventBus);
});

server.on('error', (error) => {
    console.error(`[mingle-messaging] server error: ${error.message}`);
    process.exitCode = 1;
});

function shutdown(): void {
    wss.close();
    server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.listen(Number.isFinite(PORT) && PORT > 0 ? PORT : 3002, '0.0.0.0', () => {
    console.log(
        `[mingle-messaging] listening on 0.0.0.0:${Number.isFinite(PORT) && PORT > 0 ? PORT : 3002}; `
        + `ws=${CONVERSATION_EVENTS_WS_PATH}; realtimeSecret=${REALTIME_SECRET ? 'configured' : 'missing'}`,
    );
});

import http from 'http';
import { RoomServiceClient } from 'livekit-server-sdk';
import { env, missingProviderKeys } from './env';
import { closeAllInterpreters, ensureInterpreter, onInterpreterClosed, runningRoomNames } from './interpreter';
import { buildUsageReport, roomsNeedingInterpreter, toHttpUrl, type RoomSnapshot } from './service-logic';

// Production entry. Watches the LiveKit server for app voice rooms
// ("voice-*") and keeps one hidden interpreter in each room that has a human.
// The interpreter leaves by itself 30 s after the last human (IDLE_LEAVE_MS).
// No POC page is served here; only /health for Railway.

const POLL_MS = Math.max(1000, Number(process.env.VOICE_AGENT_POLL_MS) || 3000);
const PORT = Number(process.env.PORT) || 8080;
const APP_INTERNAL_URL = (process.env.APP_INTERNAL_URL || '').trim().replace(/\/$/, '');
const VOICE_INTERNAL_SECRET = (process.env.VOICE_INTERNAL_SECRET || '').trim();

const rooms = new RoomServiceClient(toHttpUrl(env.livekitUrl), env.livekitApiKey, env.livekitApiSecret);
let lastPollOk = 0;
let lastPollError = '';
let stopping = false;
let pollTimer: NodeJS.Timeout | null = null;

async function snapshot(): Promise<RoomSnapshot[]> {
    const list = await rooms.listRooms();
    const voiceRooms = list.filter((room) => room.name.startsWith('voice-') && room.numParticipants > 0);
    return Promise.all(voiceRooms.map(async (room) => ({
        name: room.name,
        participantIdentities: (await rooms.listParticipants(room.name)).map((participant) => participant.identity),
    })));
}

async function poll(): Promise<void> {
    if (stopping) return;
    try {
        for (const name of roomsNeedingInterpreter(await snapshot())) {
            void ensureInterpreter(name).catch(() => undefined);
        }
        lastPollOk = Date.now();
        lastPollError = '';
    } catch (error) {
        lastPollError = error instanceof Error ? error.message : String(error);
        console.warn(`[service] poll failed: ${lastPollError}`);
    } finally {
        if (!stopping) pollTimer = setTimeout(() => void poll(), POLL_MS);
    }
}

// Usage goes to the app for coin billing. Optional: without APP_INTERNAL_URL
// and VOICE_INTERNAL_SECRET it is only logged.
onInterpreterClosed((interpreter) => {
    const report = buildUsageReport({
        room: interpreter.roomName,
        startedAtMs: interpreter.startedAt,
        endedAtMs: Date.now(),
        usage: interpreter.usage,
        stats: interpreter.stats,
    });
    console.log(`[service] usage ${JSON.stringify(report)}`);
    if (!APP_INTERNAL_URL || !VOICE_INTERNAL_SECRET) return;
    fetch(`${APP_INTERNAL_URL}/api/internal/voice/usage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-voice-internal-secret': VOICE_INTERNAL_SECRET },
        body: JSON.stringify(report),
    })
        .then((response) => {
            if (!response.ok) console.warn(`[service] usage post ${report.room} -> HTTP ${response.status}`);
        })
        .catch((error) => console.warn(`[service] usage post ${report.room} failed: ${error?.message ?? error}`));
});

const server = http.createServer((request, response) => {
    if (request.url === '/health') {
        // Healthy once the LiveKit server has answered at least once recently.
        const fresh = Date.now() - lastPollOk < Math.max(30_000, POLL_MS * 5);
        response.writeHead(fresh ? 200 : 503, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ ok: fresh, rooms: runningRoomNames().length, lastPollError: lastPollError || undefined }));
        return;
    }
    response.writeHead(404).end();
});

async function shutdown(signal: string): Promise<void> {
    if (stopping) return;
    stopping = true;
    console.log(`[service] ${signal}: leaving ${runningRoomNames().length} room(s)`);
    if (pollTimer) clearTimeout(pollTimer);
    server.close();
    await Promise.race([closeAllInterpreters(), new Promise((resolve) => setTimeout(resolve, 8000))]);
    process.exit(0);
}

const missing = missingProviderKeys();
if (missing.length) {
    console.error(`[service] missing keys: ${missing.join(', ')}`);
    process.exit(1);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
server.listen(PORT, '0.0.0.0', () => {
    console.log(`[service] watching ${env.livekitUrl} every ${POLL_MS} ms, health on :${PORT}/health`);
    void poll();
});

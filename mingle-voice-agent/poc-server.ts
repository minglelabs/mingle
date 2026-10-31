import fs from 'fs';
import http from 'http';
import net from 'net';
import path from 'path';
import { randomUUID } from 'crypto';
import { env, isLocalLivekit, missingProviderKeys } from './env';
import { createJoinToken } from './token';
import { ensureInterpreter, normalizeLang } from './interpreter';

// POC server: test page + join tokens + one interpreter per room. With a local
// `livekit-server --dev`, LiveKit's signaling (/rtc) is proxied through this
// origin so a single https tunnel (ngrok) is enough for iPhone Safari; media
// still flows over UDP straight to this Mac on the LAN.
const PUBLIC_DIR = path.join(__dirname, 'public');
const LIVEKIT_CLIENT = path.join(__dirname, 'node_modules', 'livekit-client', 'dist', 'livekit-client.umd.js');
const upstream = new URL(env.livekitUrl.replace(/^ws/, 'http'));
const proxyLivekit = isLocalLivekit();

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
}

function sendFile(res: http.ServerResponse, file: string, type: string): void {
    fs.readFile(file, (error, data) => {
        if (error) return sendJson(res, 404, { error: 'not_found' });
        res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
        res.end(data);
    });
}

async function handleToken(url: URL, res: http.ServerResponse): Promise<void> {
    const room = (url.searchParams.get('room') || 'poc').trim().slice(0, 64) || 'poc';
    const name = (url.searchParams.get('name') || '').trim().slice(0, 32) || '게스트';
    const lang = normalizeLang(url.searchParams.get('lang')) || 'ko';
    const identity = `${name}-${randomUUID().slice(0, 6)}`;
    const token = await createJoinToken({ room, identity, name, attributes: { lang, interpret: 'on' } });
    await ensureInterpreter(room);
    // Empty url = connect to this page's own origin (proxied local LiveKit).
    sendJson(res, 200, { token, url: proxyLivekit ? '' : env.livekitUrl, identity, room, lang });
}

function proxyHttp(req: http.IncomingMessage, res: http.ServerResponse): void {
    const forward = http.request({
        host: upstream.hostname,
        port: upstream.port,
        method: req.method,
        path: req.url,
        headers: req.headers,
    }, (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
        upstreamRes.pipe(res);
    });
    forward.on('error', () => sendJson(res, 502, { error: 'livekit_unreachable' }));
    req.pipe(forward);
}

function proxyUpgrade(req: http.IncomingMessage, socket: net.Socket, head: Buffer): void {
    const target = net.connect(Number(upstream.port), upstream.hostname, () => {
        const lines = [`${req.method} ${req.url} HTTP/1.1`];
        for (let i = 0; i < req.rawHeaders.length; i += 2) lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
        target.write(`${lines.join('\r\n')}\r\n\r\n`);
        if (head.length) target.write(head);
        socket.pipe(target).pipe(socket);
    });
    const close = () => {
        socket.destroy();
        target.destroy();
    };
    target.on('error', close);
    socket.on('error', close);
}

const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
    if (proxyLivekit && url.pathname.startsWith('/rtc')) return proxyHttp(req, res);
    if (url.pathname === '/' || url.pathname === '/index.html') return sendFile(res, path.join(PUBLIC_DIR, 'index.html'), 'text/html; charset=utf-8');
    if (url.pathname === '/livekit-client.umd.js') return sendFile(res, LIVEKIT_CLIENT, 'text/javascript; charset=utf-8');
    if (url.pathname === '/api/token') {
        handleToken(url, res).catch((error) => {
            console.warn('token request failed', error);
            sendJson(res, 500, { error: 'token_failed' });
        });
        return;
    }
    if (url.pathname === '/health') return sendJson(res, 200, { ok: true });
    sendJson(res, 404, { error: 'not_found' });
});

server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url || '/', 'http://localhost');
    if (proxyLivekit && url.pathname.startsWith('/rtc')) return proxyUpgrade(req, socket as net.Socket, head);
    socket.destroy();
});

const missing = missingProviderKeys();
if (missing.length) console.warn(`missing keys (interpretation will fail): ${missing.join(', ')}`);
server.listen(env.port, '0.0.0.0', () => {
    console.log(`voice POC on http://localhost:${env.port} (LiveKit ${env.livekitUrl}${proxyLivekit ? ', proxied at /rtc' : ''})`);
});

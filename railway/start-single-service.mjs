#!/usr/bin/env node

import { spawn } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';

const DEFAULT_PUBLIC_PORT = 8080;
const DEFAULT_APP_PORT = 3000;
const DEFAULT_STT_PORT = 3001;
const DEFAULT_HEALTH_PATH = '/railway/health';
const DEFAULT_STT_WS_PATH = '/stt';
const DEFAULT_SHUTDOWN_GRACE_MS = 10_000;

const publicPort = parseInteger(process.env.PORT, DEFAULT_PUBLIC_PORT);
const appPort = parseInteger(process.env.MINGLE_APP_PORT, DEFAULT_APP_PORT);
const sttPort = parseInteger(process.env.MINGLE_STT_PORT, DEFAULT_STT_PORT);
const bindHost = process.env.MINGLE_RAILWAY_BIND_HOST || '0.0.0.0';
const targetHost = process.env.MINGLE_RAILWAY_TARGET_HOST || '127.0.0.1';
const healthPath = normalizePath(process.env.MINGLE_RAILWAY_HEALTH_PATH || DEFAULT_HEALTH_PATH);
const sttWsPath = normalizePath(
  process.env.MINGLE_STT_WS_PATH || process.env.NEXT_PUBLIC_WS_PATH || DEFAULT_STT_WS_PATH,
);
const shutdownGraceMs = parseInteger(process.env.MINGLE_RAILWAY_SHUTDOWN_GRACE_MS, DEFAULT_SHUTDOWN_GRACE_MS);
const children = new Map();

let isShuttingDown = false;

function parseInteger(rawValue, fallback) {
  const parsed = Number.parseInt(String(rawValue || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizePath(rawValue) {
  const trimmed = String(rawValue || '').trim();
  if (!trimmed) return '/';
  const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withSlash.length > 1 ? withSlash.replace(/\/+$/, '') : withSlash;
}

function requestPath(rawUrl) {
  try {
    return new URL(rawUrl || '/', 'http://mingle.local').pathname;
  } catch {
    return '/';
  }
}

function isPathMatch(rawUrl, pathPrefix) {
  const pathname = requestPath(rawUrl);
  return pathname === pathPrefix || pathname.startsWith(`${pathPrefix}/`);
}

function stripHopByHopHeaders(headers) {
  const nextHeaders = { ...headers };
  const connectionTokens = String(headers.connection || '')
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);

  for (const headerName of [
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
    ...connectionTokens,
  ]) {
    delete nextHeaders[headerName];
  }

  return nextHeaders;
}

function prefixStream(stream, label, output) {
  let buffered = '';

  stream.on('data', (chunk) => {
    buffered += chunk.toString();
    const lines = buffered.split(/\r?\n/);
    buffered = lines.pop() || '';

    for (const line of lines) {
      if (line) output.write(`[${label}] ${line}\n`);
    }
  });

  stream.on('end', () => {
    if (buffered) output.write(`[${label}] ${buffered}\n`);
  });
}

function spawnService(name, command, args, envOverrides) {
  const child = spawn(command, args, {
    cwd: '/app',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      HOSTNAME: '0.0.0.0',
      ...envOverrides,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  children.set(name, child);
  prefixStream(child.stdout, name, process.stdout);
  prefixStream(child.stderr, name, process.stderr);

  child.on('error', (error) => {
    console.error(`[railway] ${name} failed to start: ${error.message}`);
    shutdown(1);
  });

  child.on('exit', (code, signal) => {
    const detail = signal ? `signal ${signal}` : `code ${code ?? 0}`;
    console.error(`[railway] ${name} exited with ${detail}`);
    if (!isShuttingDown) {
      shutdown(code && code > 0 ? code : 1);
    }
  });

  return child;
}

function isChildAlive(name) {
  const child = children.get(name);
  return Boolean(child && child.exitCode === null && child.signalCode === null);
}

function waitForPort(port, timeoutMs = 500) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: targetHost, port });
    let settled = false;

    const finish = (ok) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ok);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

async function handleHealth(_req, res) {
  const [appAccepting, sttAccepting] = await Promise.all([
    waitForPort(appPort),
    waitForPort(sttPort),
  ]);
  const appAlive = isChildAlive('mingle-app');
  const sttAlive = isChildAlive('mingle-stt');
  const ok = appAlive && sttAlive && appAccepting && sttAccepting;

  res.writeHead(ok ? 200 : 503, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify({
    ok,
    app: { alive: appAlive, accepting: appAccepting, port: appPort },
    stt: { alive: sttAlive, accepting: sttAccepting, port: sttPort, path: sttWsPath },
  }));
}

function appendForwardedHeaders(req, headers) {
  const socketAddress = req.socket.remoteAddress || '';
  const forwardedFor = [headers['x-forwarded-for'], socketAddress].filter(Boolean).join(', ');
  const forwardedHost = headers['x-forwarded-host'] || req.headers.host || '';
  const forwardedProto = headers['x-forwarded-proto'] || (process.env.RAILWAY_ENVIRONMENT_ID ? 'https' : 'http');

  return {
    ...headers,
    host: req.headers.host || headers.host || `${targetHost}:${appPort}`,
    'x-forwarded-for': forwardedFor,
    'x-forwarded-host': forwardedHost,
    'x-forwarded-proto': forwardedProto,
  };
}

function proxyHttpToApp(req, res) {
  const upstreamHeaders = appendForwardedHeaders(req, stripHopByHopHeaders(req.headers));
  const upstreamReq = http.request({
    host: targetHost,
    port: appPort,
    method: req.method,
    path: req.url,
    headers: upstreamHeaders,
  }, (upstreamRes) => {
    res.writeHead(upstreamRes.statusCode || 502, stripHopByHopHeaders(upstreamRes.headers));
    upstreamRes.pipe(res);
  });

  upstreamReq.setTimeout(120_000, () => {
    upstreamReq.destroy(new Error('mingle-app upstream timed out'));
  });

  upstreamReq.on('error', (error) => {
    console.error(`[railway] mingle-app proxy error: ${error.message}`);
    if (!res.headersSent) {
      res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    }
    res.end('Bad Gateway');
  });

  req.pipe(upstreamReq);
}

function writeUpgradeRequest(req, targetPort, upstream, head) {
  const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
  const headers = {
    ...req.headers,
    host: req.headers.host || `${targetHost}:${targetPort}`,
  };

  for (const [name, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      for (const item of value) lines.push(`${name}: ${item}`);
    } else if (value !== undefined) {
      lines.push(`${name}: ${value}`);
    }
  }

  upstream.write(`${lines.join('\r\n')}\r\n\r\n`);
  if (head?.length) upstream.write(head);
}

function proxyUpgrade(req, socket, head, targetPort, label) {
  const upstream = net.createConnection({ host: targetHost, port: targetPort });
  let connected = false;

  const fail = (error) => {
    if (error) console.error(`[railway] ${label} upgrade proxy error: ${error.message}`);
    if (!connected && !socket.destroyed) {
      socket.write('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n');
    }
    socket.destroy();
    upstream.destroy();
  };

  upstream.once('connect', () => {
    connected = true;
    writeUpgradeRequest(req, targetPort, upstream, head);
    socket.pipe(upstream).pipe(socket);
  });

  upstream.once('error', fail);
  socket.once('error', () => upstream.destroy());
  socket.once('close', () => upstream.destroy());
}

const server = http.createServer((req, res) => {
  if (isPathMatch(req.url, healthPath)) {
    void handleHealth(req, res);
    return;
  }

  proxyHttpToApp(req, res);
});

server.on('upgrade', (req, socket, head) => {
  if (isPathMatch(req.url, sttWsPath)) {
    proxyUpgrade(req, socket, head, sttPort, 'mingle-stt');
    return;
  }

  proxyUpgrade(req, socket, head, appPort, 'mingle-app');
});

server.on('error', (error) => {
  console.error(`[railway] proxy server error: ${error.message}`);
  shutdown(1);
});

function shutdown(exitCode = 0) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.error('[railway] shutting down');
  server.close();

  for (const child of children.values()) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
    }
  }

  setTimeout(() => {
    for (const child of children.values()) {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
      }
    }
    process.exit(exitCode);
  }, shutdownGraceMs).unref();
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

spawnService('mingle-app', 'pnpm', ['--dir', '/app/mingle-app', 'start'], {
  PORT: String(appPort),
});
spawnService('mingle-stt', 'pnpm', ['--dir', '/app/mingle-stt', 'start'], {
  PORT: String(sttPort),
});

server.listen(publicPort, bindHost, () => {
  console.log(
    `[railway] listening on ${bindHost}:${publicPort}; app=${targetHost}:${appPort}; stt=${targetHost}:${sttPort}${sttWsPath}`,
  );
});

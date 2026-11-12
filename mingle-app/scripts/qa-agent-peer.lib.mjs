// The second QA account ("peer") for the /qa scenarios that need another person in a room:
// a voice talk counterpart (qa-voice-bot) or a Hash Rush opponent (qa-hash-rush-player).
// It talks to this worktree's devbox on 127.0.0.1 only; nothing here reaches production.
//
// Accounts live in mingle-app/qa/agent/local/ (gitignored):
//   account.json       the QA agent's own account (made by the /qa skill)
//   peer-account.json  the peer, made here on first use
// Passwords are never printed.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const APP_ROOT = path.resolve(SCRIPT_DIR, '..');
export const REPO_ROOT = path.resolve(APP_ROOT, '..');
export const LOCAL_DIR = path.join(APP_ROOT, 'qa/agent/local');
export const PRIMARY_ACCOUNT_PATH = path.join(LOCAL_DIR, 'account.json');
export const PEER_ACCOUNT_PATH = path.join(LOCAL_DIR, 'peer-account.json');
export const GOLDEN_DIR = path.join(APP_ROOT, 'test-fixtures/audio/local/golden');
export const GOLDEN_MANIFEST_PATH = path.join(APP_ROOT, 'test-fixtures/audio/golden/manifest.json');

export function fail(message) {
  console.error(JSON.stringify({ error: message }));
  process.exit(1);
}

export function readOption(args, name, fallback = undefined) {
  const index = args.indexOf(name);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : fallback;
}

export function readOptions(args, name) {
  const values = [];
  args.forEach((arg, index) => {
    if (arg === name && index + 1 < args.length) values.push(args[index + 1]);
  });
  return values;
}

function devboxEnv() {
  const envPath = path.join(REPO_ROOT, '.devbox.env');
  if (!fs.existsSync(envPath)) fail('missing .devbox.env; is devbox set up in this worktree?');
  return Object.fromEntries(fs.readFileSync(envPath, 'utf8')
    .split('\n')
    .map((line) => /^([A-Z0-9_]+)=(.*)$/.exec(line))
    .filter(Boolean)
    .map(([, key, value]) => [key, value]));
}

/** This worktree's devbox web server, as the Mac reaches it. */
export function devboxBaseUrl() {
  if (process.env.MINGLE_QA_BASE_URL) return process.env.MINGLE_QA_BASE_URL.replace(/\/+$/, '');
  const port = devboxEnv().DEVBOX_WEB_PORT || fail('DEVBOX_WEB_PORT missing from .devbox.env');
  return `http://127.0.0.1:${port}`;
}

export function assertLocalBaseUrl(baseUrl) {
  const host = new URL(baseUrl).hostname;
  if (host !== '127.0.0.1' && host !== 'localhost') fail(`refusing a non-local server: ${host}`);
}

export function readAccount(file) {
  if (!fs.existsSync(file)) return null;
  const account = JSON.parse(fs.readFileSync(file, 'utf8'));
  return account?.email && account?.password ? account : null;
}

/** A tiny cookie jar, enough for next-auth. */
export function createSession(baseUrl) {
  assertLocalBaseUrl(baseUrl);
  const jar = new Map();
  const remember = (response) => {
    for (const line of response.headers.getSetCookie?.() ?? []) {
      const [pair] = line.split(';');
      const eq = pair.indexOf('=');
      if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  };
  const cookieHeader = () => [...jar].map(([key, value]) => `${key}=${value}`).join('; ');
  async function request(method, pathname, body, extraHeaders = {}) {
    const headers = { ...extraHeaders, cookie: cookieHeader() };
    let payload;
    if (body instanceof URLSearchParams) {
      headers['content-type'] = 'application/x-www-form-urlencoded';
      payload = body.toString();
    } else if (body !== undefined) {
      headers['content-type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const response = await fetch(`${baseUrl}${pathname}`, { method, headers, body: payload, redirect: 'manual' });
    remember(response);
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { status: response.status, json, text };
  }
  return {
    baseUrl,
    request,
    get: (pathname) => request('GET', pathname),
    post: (pathname, body) => request('POST', pathname, body ?? {}),
    async signIn(account) {
      const csrf = await request('GET', '/api/auth/csrf');
      const csrfToken = csrf.json?.csrfToken || fail('no csrf token from /api/auth/csrf');
      const form = new URLSearchParams({ csrfToken, email: account.email, password: account.password, json: 'true', callbackUrl: baseUrl });
      await request('POST', '/api/auth/callback/email-password', form);
      const session = await request('GET', '/api/auth/session');
      const userId = session.json?.user?.id;
      if (!userId) fail(`sign-in failed for ${account.email}`);
      return userId;
    },
  };
}

/** The peer account, created on the devbox the first time. */
export async function ensurePeerAccount(baseUrl) {
  const existing = readAccount(PEER_ACCOUNT_PATH);
  if (existing) return existing;
  const worktree = path.basename(REPO_ROOT).replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'local';
  const account = {
    email: `qa-agent-peer+${worktree}@mingle.test`,
    password: crypto.randomBytes(18).toString('base64url'),
    name: 'QA Peer',
  };
  const session = createSession(baseUrl);
  const created = await session.post('/api/auth/signup', {
    email: account.email,
    password: account.password,
    name: account.name,
    primaryLanguages: ['en', 'ko'],
    birthDate: '2000-01-01',
  });
  if (created.status >= 400 && created.json?.error !== 'email_already_registered') {
    fail(`peer signup failed: ${created.status} ${created.json?.error ?? ''}`);
  }
  fs.mkdirSync(LOCAL_DIR, { recursive: true });
  fs.writeFileSync(PEER_ACCOUNT_PATH, `${JSON.stringify(account, null, 2)}\n`, { mode: 0o600 });
  return account;
}

export async function signInPrimary(baseUrl) {
  const account = readAccount(PRIMARY_ACCOUNT_PATH) || fail(`missing ${path.relative(APP_ROOT, PRIMARY_ACCOUNT_PATH)}; run /qa setup first`);
  const session = createSession(baseUrl);
  const userId = await session.signIn(account);
  return { session, userId };
}

export async function signInPeer(baseUrl) {
  const account = await ensurePeerAccount(baseUrl);
  const session = createSession(baseUrl);
  const userId = await session.signIn(account);
  return { session, userId, account };
}

/** Makes the peer a member of a room the QA account owns (through the room's share link). */
export async function joinPeerToRoom(baseUrl, conversationId) {
  const primary = await signInPrimary(baseUrl);
  const shared = await primary.session.post(`/api/conversations/${encodeURIComponent(conversationId)}/share`, { enabled: true });
  const shareToken = shared.json?.shareToken || fail(`could not share room ${conversationId}: ${shared.status} ${shared.json?.error ?? ''}`);
  const peer = await signInPeer(baseUrl);
  const joined = await peer.session.post(`/api/conversations/shared/${encodeURIComponent(shareToken)}/join`, {});
  if (joined.status >= 400 && joined.json?.error !== 'conversation_channel_join_conflict') {
    fail(`peer could not join: ${joined.status} ${joined.json?.error ?? ''}`);
  }
  return { peerUserId: peer.userId, status: joined.status };
}

/** The golden fixtures (ground-truth transcripts) and their local WAVs. */
export function goldenFixtures() {
  const manifest = JSON.parse(fs.readFileSync(GOLDEN_MANIFEST_PATH, 'utf8'));
  return manifest.fixtures.map((fixture) => {
    const wav = path.join(GOLDEN_DIR, `${fixture.id}.wav`);
    return { ...fixture, wav, rendered: fs.existsSync(wav) };
  });
}

export function goldenFixture(id) {
  const fixture = goldenFixtures().find((candidate) => candidate.id === id) || fail(`unknown fixture ${id}`);
  if (!fixture.rendered) fail(`fixture ${id} is not rendered; run: node scripts/qa-audio-golden.mjs`);
  return fixture;
}

/** Duration of a PCM WAV in ms. */
export function wavDurationMs(file) {
  const buffer = fs.readFileSync(file);
  let offset = 12;
  let byteRate = 0;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    if (id === 'fmt ') byteRate = buffer.readUInt32LE(offset + 16);
    if (id === 'data') return byteRate ? Math.round((size / byteRate) * 1000) : 0;
    offset += 8 + size + (size % 2);
  }
  return 0;
}

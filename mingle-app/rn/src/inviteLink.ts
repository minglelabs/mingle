// Invite tickets in the app shell. An invite reaches the app three ways: the
// invite link (https://<web host>/i/{code}) tapped with the app installed,
// the mingle://invite/{code} link on the landing page, and on Android the
// Play install referrer ("invite={code}") after a fresh install. Each ends as
// one `mingle:native-invite` event for the page, which keeps the code until
// the person is signed in and then opens the room with the inviter.

const INVITE_CODE_PATTERN = /^[a-z0-9]{5}$/;
const INVITE_APP_SCHEME = 'mingle:';
const INVITE_APP_SCHEME_HOST = 'invite';
const INVITE_INSTALL_REFERRER_KEY = 'invite';

export const NATIVE_INVITE_EVENT = 'mingle:native-invite';
export const NATIVE_INVITE_WINDOW_KEY = '__MINGLE_PENDING_NATIVE_INVITE';

export type NativeInviteSource = 'link' | 'install_referrer';
export type NativeInvite = { code: string; source: NativeInviteSource };

export function normalizeInviteCode(rawValue: unknown): string | null {
  if (typeof rawValue !== 'string') return null;
  let decoded = rawValue.trim();
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    return null;
  }
  const code = decoded.toLowerCase();
  return INVITE_CODE_PATTERN.test(code) ? code : null;
}

/** The invite code in an invite link, or null when the URL is something else. */
export function parseNativeInviteLink(rawValue: string, allowedHttpsOrigin: string): NativeInvite | null {
  const value = rawValue.trim();
  if (!value) return null;

  // RN's URL polyfill does not parse custom schemes: read mingle://invite/{code} by hand.
  if (value.toLowerCase().startsWith(INVITE_APP_SCHEME)) {
    const [host, ...rest] = value.slice(INVITE_APP_SCHEME.length).replace(/^\/\//, '').split(/[?#]/)[0].split('/');
    if (host !== INVITE_APP_SCHEME_HOST) return null;
    const code = normalizeInviteCode(rest[0] ?? '');
    return code ? { code, source: 'link' } : null;
  }

  let allowedOrigin = '';
  try {
    allowedOrigin = new URL(allowedHttpsOrigin).origin;
  } catch {
    return null;
  }
  const match = /^(https?:\/\/[^/?#]+)\/i\/([^/?#]+)\/?(?:[?#].*)?$/i.exec(value);
  if (!match || match[1].toLowerCase() !== allowedOrigin.toLowerCase()) return null;
  const code = normalizeInviteCode(match[2]);
  return code ? { code, source: 'link' } : null;
}

/** The invite code inside a Play install referrer string ("invite=ab3de&utm_source=..."). */
export function parseInstallReferrerInvite(referrer: unknown): NativeInvite | null {
  if (typeof referrer !== 'string') return null;
  for (const part of referrer.split('&')) {
    const [key, value] = part.split('=');
    if (key?.trim() !== INVITE_INSTALL_REFERRER_KEY) continue;
    const code = normalizeInviteCode(value ?? '');
    if (code) return { code, source: 'install_referrer' };
  }
  return null;
}

/** Leaves the invite on the window (for a listener that mounts later) and dispatches it. */
export function buildNativeInviteEventScript(invite: NativeInvite): string {
  const serialized = JSON.stringify(invite);
  return `(function () { const detail = ${serialized}; window[${JSON.stringify(NATIVE_INVITE_WINDOW_KEY)}] = detail; window.dispatchEvent(new CustomEvent(${JSON.stringify(NATIVE_INVITE_EVENT)}, { detail })); })(); true;`;
}

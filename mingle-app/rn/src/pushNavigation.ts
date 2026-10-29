/**
 * Push-notification tap → WebView destination.
 *
 * A push payload (iOS `userInfo`, Android intent extras) may carry a ready-made
 * in-app `url` (comment/reply pushes ship `feedHref(...)`), or — for message
 * pushes — only a `conversationId`. This module turns either into a single
 * *relative* path the WebView is allowed to open, and rejects everything else.
 *
 * Security: the returned path is always same-origin. Only a relative path that
 * starts with a single `/` (not `//`), carries no scheme and no host, and does
 * not try to escape with a leading `..` segment is accepted. This is the open-
 * redirect guard — a payload that names another origin is ignored, never
 * navigated to. The functions here are pure (no React, no native modules) so
 * the guard can be unit-tested in isolation.
 */

/** Notification `type` values the server sends (see server/push-notifications.ts). */
export type PushNotificationType =
  | "conversation_message"
  | "comment"
  | "comment_reply"
  | "follow"
  | string;

/** The push fields this module reads, normalized from iOS userInfo / Android extras. */
export type PushTapPayload = {
  type?: unknown;
  url?: unknown;
  conversationId?: unknown;
};

/** The conversation-room query key the web uses (see direct-conversation-navigation.ts). */
const CONVERSATION_QUERY_KEY = "conversation";

/** A conversation/channel id is an opaque token; keep it conservative. */
const CONVERSATION_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/** A BCP-47-ish locale segment as used in `/{locale}/...` routes. */
const LOCALE_PATTERN = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * True only for a same-origin relative path: it must start with exactly one
 * `/`, must not be protocol-relative (`//host`), must carry no scheme or
 * authority, and must not contain a `..` path segment. Query and hash are
 * allowed. Anything else (absolute URL, `mingle://…`, `javascript:`,
 * whitespace-obfuscated scheme, backslash tricks) is rejected.
 */
export function isSafeRelativeAppPath(value: unknown): value is string {
  const path = typeof value === "string" ? value : "";
  if (!path) return false;
  // Reject control characters and any backslash (Windows-style path / escape).
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(path)) return false;
  // Must start with a single slash and not be protocol-relative.
  if (path[0] !== "/" || path[1] === "/") return false;

  // Reject any `..` traversal segment in the RAW path (before URL parsing
  // collapses it) — the pathname portion is everything before ? or #.
  const rawPathname = path.split(/[?#]/, 1)[0];
  if (rawPathname.split("/").some((segment) => segment === "..")) return false;

  // Resolve against a throwaway origin: if the resolved origin is anything
  // other than that origin, the path smuggled an authority/scheme.
  let resolved: URL;
  try {
    resolved = new URL(path, "https://mingle.invalid");
  } catch {
    return false;
  }
  if (resolved.origin !== "https://mingle.invalid") return false;
  if (resolved.protocol !== "https:") return false;

  return true;
}

/**
 * Build the conversation-room relative path from a locale and a channel id:
 * `/{locale}/conversations?conversation={id}`. Returns null when either input
 * is missing or malformed. The result is guaranteed to satisfy
 * `isSafeRelativeAppPath`.
 */
export function buildConversationRoomPath(locale: string, conversationId: string): string | null {
  const normalizedLocale = asTrimmedString(locale).replace(/^\/+|\/+$/g, "");
  const normalizedId = asTrimmedString(conversationId);
  if (!LOCALE_PATTERN.test(normalizedLocale)) return null;
  if (!CONVERSATION_ID_PATTERN.test(normalizedId)) return null;

  const path = `/${encodeURIComponent(normalizedLocale)}/conversations`;
  const query = new URLSearchParams();
  query.set(CONVERSATION_QUERY_KEY, normalizedId);
  return `${path}?${query.toString()}`;
}

/**
 * Resolve a push payload to the relative path the WebView should open, or null
 * when the payload names nothing safe.
 *
 * Priority:
 *  1. An explicit `url` that passes the same-origin relative-path guard
 *     (comment/reply pushes carry `feedHref(...)`).
 *  2. Otherwise, for a message push, a `conversationId` + fallback locale →
 *     the conversation-room path.
 *
 * `fallbackLocale` is used only for the message fallback (comment pushes embed
 * their own locale in `url`).
 */
export function resolvePushTapPath(
  payload: PushTapPayload,
  fallbackLocale: string,
): string | null {
  const url = asTrimmedString(payload.url);
  if (url) {
    return isSafeRelativeAppPath(url) ? url : null;
  }

  const type = asTrimmedString(payload.type);
  const conversationId = asTrimmedString(payload.conversationId);
  if (conversationId && (type === "conversation_message" || type === "")) {
    return buildConversationRoomPath(fallbackLocale, conversationId);
  }

  return null;
}

/** Window key the WebView bridge reads a pending push destination from. */
export const NATIVE_PUSH_TAP_WINDOW_KEY = "__MINGLE_PENDING_NATIVE_PUSH_TAP";
/** DOM event the WebView listens for when a push destination arrives. */
export const NATIVE_PUSH_TAP_EVENT = "mingle:native-push-tap";

export type NativePushTapRequest = {
  path: string;
  sequence: number;
};

/**
 * Build the injected-JS snippet that hands a resolved push destination to the
 * web app: it stashes the request on `window` and dispatches a CustomEvent.
 * The `path` is validated here as a final guard before it reaches the page.
 */
export function buildNativePushTapEventScript(request: NativePushTapRequest): string {
  if (!isSafeRelativeAppPath(request.path)) {
    return "true;";
  }
  const serialized = JSON.stringify({
    path: request.path,
    sequence: Number.isFinite(request.sequence) ? Math.floor(request.sequence) : 0,
  });
  return `(function () { var detail = ${serialized}; window[${JSON.stringify(
    NATIVE_PUSH_TAP_WINDOW_KEY,
  )}] = detail; window.dispatchEvent(new CustomEvent(${JSON.stringify(
    NATIVE_PUSH_TAP_EVENT,
  )}, { detail: detail })); })(); true;`;
}

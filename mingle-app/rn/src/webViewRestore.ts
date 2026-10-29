// How long the last screen survives an OS kill of the backgrounded app. The
// native storage keeps the original conversationRestore* keys so payloads
// written by older builds (conversation rooms only) are still read.
export const NATIVE_WEB_RESTORE_TTL_MS = 12 * 60 * 60 * 1000;

const CONVERSATION_QUERY_KEY = 'conversation';
const CONVERSATIONS_PATH_SEGMENT = 'conversations';

export type NativeConversationRestoreRuntimeConfig = {
  conversationRestoreUrl?: string;
  conversationRestoreConversationId?: string;
  conversationRestoreCreatedAtMs?: string | number;
};

export type NativeConversationRestorePayload = {
  url: string;
  conversationId: string;
  createdAtMs: number;
};

export type NativeWebRestorePayload = {
  url: string;
  // Stored in the native conversationId slot: the room id for a conversation
  // room (same value older builds wrote) or `route:<path>` for other screens.
  restoreKey: string;
  createdAtMs: number;
};

type WebRestoreRoute = {
  // Path segments after the locale, e.g. ['mypage', 'follows'].
  pathSegments: string[];
  // Query params the page itself reads; runtime params come from the base URL.
  query: Array<[string, string]>;
  restoreKey: string;
};

const ROUTE_RESTORE_KEY_PREFIX = 'route:';

// Screens that are safe to reopen after a cold start, keyed by the path after
// the locale, with the page-owned query keys worth carrying over. Anything else
// (auth callbacks, sign-in, translator, admin, creation flows, share links)
// falls back to the default first screen.
const WEB_RESTORE_ROUTE_QUERY_KEYS: Record<string, string[]> = {
  conversations: [CONVERSATION_QUERY_KEY],
  // The feed keeps its own position (active post) in web storage; a
  // `postId` deep link is one-shot and must not be replayed.
  feed: [],
  'posts/viewer': ['kind', 'authorId', 'q', 'postId'],
  connect: [],
  'connect/search/people': ['q'],
  notifications: [],
  mypage: [],
  'mypage/follows': ['tab', 'q'],
  'mypage/share': ['profileHandle', 'profileUserId'],
  account: [],
};
const WEB_RESTORE_USER_PROFILE_SEGMENT = 'users';
// `/{locale}/mypage/posts/{section}`
const WEB_RESTORE_MY_POSTS_PATH = 'mypage/posts';

export type ConversationWebUrlKind = 'room' | 'list' | null;

function parseTimestampMs(rawValue: string | number | undefined): number {
  if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
    return Math.floor(rawValue);
  }
  if (typeof rawValue === 'string' && rawValue.trim()) {
    const parsed = Number.parseInt(rawValue, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function readPathSegments(url: URL): string[] {
  return url.pathname.split('/').filter(Boolean);
}

export function classifyConversationWebUrl(rawUrl: string): ConversationWebUrlKind {
  if (!rawUrl) return null;

  try {
    const url = new URL(rawUrl);
    const pathSegments = readPathSegments(url);
    if (pathSegments.length < 2 || pathSegments[1] !== CONVERSATIONS_PATH_SEGMENT) {
      return null;
    }
    return url.searchParams.get(CONVERSATION_QUERY_KEY)?.trim() ? 'room' : 'list';
  } catch {
    return null;
  }
}

export function resolveConversationRestorePayloadFromUrl(
  rawUrl: string,
  createdAtMs = Date.now(),
): NativeConversationRestorePayload | null {
  const normalizedUrl = rawUrl.trim();
  if (!normalizedUrl) return null;

  try {
    const url = new URL(normalizedUrl);
    const pathSegments = readPathSegments(url);
    if (pathSegments.length < 2 || pathSegments[1] !== CONVERSATIONS_PATH_SEGMENT) {
      return null;
    }
    const conversationId = (url.searchParams.get(CONVERSATION_QUERY_KEY) || '').trim();
    if (!conversationId) return null;
    return {
      url: url.toString(),
      conversationId,
      createdAtMs,
    };
  } catch {
    return null;
  }
}

function resolveWebRestoreRoute(url: URL): WebRestoreRoute | null {
  const [locale, ...pathSegments] = readPathSegments(url);
  if (!locale || pathSegments.length === 0) return null;

  const routePath = pathSegments.join('/');
  let queryKeys = WEB_RESTORE_ROUTE_QUERY_KEYS[routePath];
  if (
    !queryKeys
    && pathSegments.length === 2
    && pathSegments[0] === WEB_RESTORE_USER_PROFILE_SEGMENT
    && pathSegments[1].trim()
  ) {
    queryKeys = [];
  }
  if (
    !queryKeys
    && pathSegments.length === 3
    && `${pathSegments[0]}/${pathSegments[1]}` === WEB_RESTORE_MY_POSTS_PATH
    && pathSegments[2].trim()
  ) {
    queryKeys = [];
  }
  if (!queryKeys) return null;

  const query: Array<[string, string]> = [];
  for (const key of queryKeys) {
    const value = (url.searchParams.get(key) || '').trim();
    if (value) query.push([key, value]);
  }

  if (routePath === CONVERSATIONS_PATH_SEGMENT) {
    const conversationId = (url.searchParams.get(CONVERSATION_QUERY_KEY) || '').trim();
    if (conversationId) {
      return { pathSegments, query, restoreKey: conversationId };
    }
  }

  const queryKey = query.map(([key, value]) => `${key}=${value}`).join('&');
  return {
    pathSegments,
    query,
    restoreKey: `${ROUTE_RESTORE_KEY_PREFIX}/${routePath}${queryKey ? `?${queryKey}` : ''}`,
  };
}

export function resolveWebRestorePayloadFromUrl(
  rawUrl: string,
  createdAtMs = Date.now(),
): NativeWebRestorePayload | null {
  const normalizedUrl = rawUrl.trim();
  if (!normalizedUrl) return null;

  try {
    const url = new URL(normalizedUrl);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    const route = resolveWebRestoreRoute(url);
    if (!route) return null;
    return {
      url: url.toString(),
      restoreKey: route.restoreKey,
      createdAtMs,
    };
  } catch {
    return null;
  }
}

export function readNativeWebRestorePayload(
  runtimeConfig: NativeConversationRestoreRuntimeConfig,
  nowMs = Date.now(),
): NativeWebRestorePayload | null {
  const url = typeof runtimeConfig.conversationRestoreUrl === 'string'
    ? runtimeConfig.conversationRestoreUrl.trim()
    : '';
  const restoreKey = typeof runtimeConfig.conversationRestoreConversationId === 'string'
    ? runtimeConfig.conversationRestoreConversationId.trim()
    : '';
  const createdAtMs = parseTimestampMs(runtimeConfig.conversationRestoreCreatedAtMs);
  if (!url || !restoreKey || createdAtMs <= 0) return null;
  if (nowMs - createdAtMs > NATIVE_WEB_RESTORE_TTL_MS) return null;

  const payload = resolveWebRestorePayloadFromUrl(url, createdAtMs);
  if (!payload || payload.restoreKey !== restoreKey) return null;
  return payload;
}

export function buildWebRestoreWebUrl(baseWebUrl: string, restoreUrl: string): string {
  if (!baseWebUrl || !restoreUrl) return '';

  try {
    const base = new URL(baseWebUrl);
    const restore = new URL(restoreUrl);
    const route = resolveWebRestoreRoute(restore);
    if (!route) return '';

    const baseLocale = readPathSegments(base)[0] || readPathSegments(restore)[0] || '';
    if (!baseLocale) return '';

    // Runtime params (native flags, insets, api namespace) always come from the
    // current launch; only the page's own params are taken from the old URL.
    const nextUrl = new URL(
      `/${baseLocale}/${route.pathSegments.join('/')}${base.search}`,
      `${base.protocol}//${base.host}`,
    );
    for (const [key, value] of route.query) {
      nextUrl.searchParams.set(key, value);
    }
    return nextUrl.toString();
  } catch {
    return '';
  }
}

export type NativeLastScreenSnapshotRuntimeConfig = {
  lastScreenSnapshotPath?: string;
  lastScreenSnapshotCreatedAtMs?: string | number;
  lastScreenSnapshotWidth?: string | number;
  lastScreenSnapshotHeight?: string | number;
  lastScreenSnapshotColorScheme?: string;
};

export type NativeLastScreenSnapshot = {
  uri: string;
  createdAtMs: number;
};

// The capture of the last screen may only stand in for the splash when it
// shows what the restored WebView will show: same window size/orientation and
// appearance, and taken no later than the restore URL expires.
export function readNativeLastScreenSnapshot(
  runtimeConfig: NativeLastScreenSnapshotRuntimeConfig,
  current: { nowMs?: number; width: number; height: number; colorScheme: string | null | undefined },
): NativeLastScreenSnapshot | null {
  const path = typeof runtimeConfig.lastScreenSnapshotPath === 'string'
    ? runtimeConfig.lastScreenSnapshotPath.trim()
    : '';
  const createdAtMs = parseTimestampMs(runtimeConfig.lastScreenSnapshotCreatedAtMs);
  if (!path || createdAtMs <= 0) return null;
  const nowMs = current.nowMs ?? Date.now();
  if (nowMs - createdAtMs > NATIVE_WEB_RESTORE_TTL_MS) return null;

  const width = parseTimestampMs(runtimeConfig.lastScreenSnapshotWidth);
  const height = parseTimestampMs(runtimeConfig.lastScreenSnapshotHeight);
  if (Math.abs(width - Math.round(current.width)) > 1 || Math.abs(height - Math.round(current.height)) > 1) {
    return null;
  }
  const colorScheme = (runtimeConfig.lastScreenSnapshotColorScheme || '').trim() || 'light';
  if (colorScheme !== (current.colorScheme || 'light')) return null;

  return {
    uri: path.startsWith('file://') ? path : `file://${path}`,
    createdAtMs,
  };
}

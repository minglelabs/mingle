export const NATIVE_CONVERSATION_RESTORE_TTL_MS = 30 * 60 * 1000;

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

export function readNativeConversationRestorePayload(
  runtimeConfig: NativeConversationRestoreRuntimeConfig,
  nowMs = Date.now(),
): NativeConversationRestorePayload | null {
  const url = typeof runtimeConfig.conversationRestoreUrl === 'string'
    ? runtimeConfig.conversationRestoreUrl.trim()
    : '';
  const conversationId = typeof runtimeConfig.conversationRestoreConversationId === 'string'
    ? runtimeConfig.conversationRestoreConversationId.trim()
    : '';
  const createdAtMs = parseTimestampMs(runtimeConfig.conversationRestoreCreatedAtMs);
  if (!url || !conversationId || createdAtMs <= 0) return null;
  if (nowMs - createdAtMs > NATIVE_CONVERSATION_RESTORE_TTL_MS) return null;

  const payload = resolveConversationRestorePayloadFromUrl(url, createdAtMs);
  if (!payload || payload.conversationId !== conversationId) return null;
  return payload;
}

export function buildConversationRestoreWebUrl(baseWebUrl: string, restoreUrl: string): string {
  if (!baseWebUrl || !restoreUrl) return '';

  try {
    const base = new URL(baseWebUrl);
    const restore = new URL(restoreUrl);
    const restoreSegments = readPathSegments(restore);
    if (restoreSegments.length < 2 || restoreSegments[1] !== CONVERSATIONS_PATH_SEGMENT) {
      return '';
    }
    const conversationId = (restore.searchParams.get(CONVERSATION_QUERY_KEY) || '').trim();
    if (!conversationId) return '';

    const baseLocale = readPathSegments(base)[0] || restoreSegments[0] || '';
    if (!baseLocale) return '';

    const nextUrl = new URL(
      `/${baseLocale}/${CONVERSATIONS_PATH_SEGMENT}${base.search}`,
      `${base.protocol}//${base.host}`,
    );
    nextUrl.searchParams.set(CONVERSATION_QUERY_KEY, conversationId);
    return nextUrl.toString();
  } catch {
    return '';
  }
}

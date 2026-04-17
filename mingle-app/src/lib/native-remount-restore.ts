const NATIVE_REMOUNT_RESTORE_CONVERSATION_STORAGE_KEY = "mingle:native-remount-restore-conversation-v1";
const NATIVE_REMOUNT_RESTORE_TTL_MS = 60_000;
const CONVERSATION_QUERY_KEY = "conversation";

type NativeRemountRestoreConversationPayload = {
  conversationId: string;
  createdAtMs: number;
};

function readPayload(rawValue: string | null): NativeRemountRestoreConversationPayload | null {
  if (!rawValue) return null;

  try {
    const parsed = JSON.parse(rawValue) as Partial<NativeRemountRestoreConversationPayload>;
    const conversationId = typeof parsed.conversationId === "string" ? parsed.conversationId.trim() : "";
    const createdAtMs = typeof parsed.createdAtMs === "number" ? parsed.createdAtMs : 0;
    if (!conversationId || !Number.isFinite(createdAtMs)) return null;
    return { conversationId, createdAtMs };
  } catch {
    return null;
  }
}

export function rememberNativeRemountRestoreConversation(conversationId: string): void {
  if (typeof window === "undefined") return;
  const normalizedConversationId = conversationId.trim();
  if (!normalizedConversationId) return;

  try {
    window.localStorage.setItem(
      NATIVE_REMOUNT_RESTORE_CONVERSATION_STORAGE_KEY,
      JSON.stringify({
        conversationId: normalizedConversationId,
        createdAtMs: Date.now(),
      } satisfies NativeRemountRestoreConversationPayload),
    );
  } catch {
    // Ignore storage failures; URL preservation remains the primary remount hint.
  }
}

export function buildNativeRemountRestoreUrl(rawUrl: string, conversationId: string | null | undefined): string {
  const normalizedUrl = typeof rawUrl === "string" ? rawUrl.trim() : "";
  const normalizedConversationId = typeof conversationId === "string" ? conversationId.trim() : "";
  if (!normalizedUrl || !normalizedConversationId) return normalizedUrl;

  try {
    const nextUrl = new URL(normalizedUrl);
    nextUrl.searchParams.set(CONVERSATION_QUERY_KEY, normalizedConversationId);
    return nextUrl.toString();
  } catch {
    return normalizedUrl;
  }
}

export function takeNativeRemountRestoreConversation(nowMs = Date.now()): string | null {
  if (typeof window === "undefined") return null;

  try {
    const payload = readPayload(window.localStorage.getItem(NATIVE_REMOUNT_RESTORE_CONVERSATION_STORAGE_KEY));
    window.localStorage.removeItem(NATIVE_REMOUNT_RESTORE_CONVERSATION_STORAGE_KEY);
    if (!payload) return null;
    if (nowMs - payload.createdAtMs > NATIVE_REMOUNT_RESTORE_TTL_MS) return null;
    return payload.conversationId;
  } catch {
    return null;
  }
}

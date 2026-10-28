export const NATIVE_CONVERSATION_SHARE_EVENT = "mingle:native-conversation-share";
export const NATIVE_CONVERSATION_SHARE_WINDOW_KEY = "__MINGLE_PENDING_NATIVE_CONVERSATION_SHARE";

const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export type NativeConversationShareOverlayRequest = {
  shareToken: string;
  linkNonce?: string;
  navigationSequence?: number;
  // True when a member opened this from the conversation list's "share"
  // action rather than a received link: the overlay then offers to copy the
  // link instead of joining a room the member is already in.
  canCopyLink?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeShareToken(value: unknown): string | null {
  if (typeof value !== "string") return null;

  let normalized = value.trim();
  try {
    normalized = decodeURIComponent(normalized);
  } catch {
    return null;
  }

  return SHARE_TOKEN_PATTERN.test(normalized) ? normalized : null;
}

export function parseNativeConversationShareOverlayRequest(
  value: unknown,
): NativeConversationShareOverlayRequest | null {
  if (!isRecord(value)) return null;

  const shareToken = normalizeShareToken(value.shareToken);
  if (!shareToken) return null;

  const linkNonce = typeof value.linkNonce === "string" && value.linkNonce.trim()
    ? value.linkNonce.trim()
    : undefined;
  const navigationSequence = typeof value.navigationSequence === "number"
    && Number.isInteger(value.navigationSequence)
    && value.navigationSequence > 0
    ? value.navigationSequence
    : undefined;

  return {
    shareToken,
    ...(linkNonce ? { linkNonce } : {}),
    ...(typeof navigationSequence === "number" ? { navigationSequence } : {}),
    ...(value.canCopyLink === true ? { canCopyLink: true } : {}),
  };
}

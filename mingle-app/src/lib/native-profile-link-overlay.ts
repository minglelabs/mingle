export const NATIVE_PROFILE_LINK_EVENT = "mingle:native-profile-link";
export const NATIVE_PROFILE_LINK_WINDOW_KEY = "__MINGLE_PENDING_NATIVE_PROFILE_LINK";

const PROFILE_LINK_USER_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export type NativeProfileLinkOverlayRequest = {
  userId: string;
  linkNonce?: string;
  navigationSequence?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeUserId(value: unknown): string | null {
  if (typeof value !== "string") return null;

  let normalized = value.trim();
  try {
    normalized = decodeURIComponent(normalized);
  } catch {
    return null;
  }

  return PROFILE_LINK_USER_ID_PATTERN.test(normalized) ? normalized : null;
}

export function parseNativeProfileLinkOverlayRequest(
  value: unknown,
): NativeProfileLinkOverlayRequest | null {
  if (!isRecord(value)) return null;

  const userId = normalizeUserId(value.userId);
  if (!userId) return null;

  const linkNonce = typeof value.linkNonce === "string" && value.linkNonce.trim()
    ? value.linkNonce.trim()
    : undefined;
  const navigationSequence = typeof value.navigationSequence === "number"
    && Number.isInteger(value.navigationSequence)
    && value.navigationSequence > 0
    ? value.navigationSequence
    : undefined;

  return {
    userId,
    ...(linkNonce ? { linkNonce } : {}),
    ...(typeof navigationSequence === "number" ? { navigationSequence } : {}),
  };
}

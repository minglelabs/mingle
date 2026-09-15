const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const CONVERSATION_SHARE_APP_SCHEME = "mingle:";
const CONVERSATION_SHARE_APP_FALLBACK_SCHEME = "mingleconversation:";
const CONVERSATION_SHARE_APP_SCHEME_HOST = "conversation-spectate";
const CONVERSATION_SHARE_APP_SCHEMES = new Set([
  CONVERSATION_SHARE_APP_SCHEME,
  CONVERSATION_SHARE_APP_FALLBACK_SCHEME,
]);

export type NativeConversationShareLink = {
  shareToken: string;
  source: "https" | "mingle";
};

function normalizeShareToken(rawValue: string): string | null {
  let decodedValue = rawValue.trim();
  try {
    decodedValue = decodeURIComponent(decodedValue);
  } catch {
    return null;
  }

  return SHARE_TOKEN_PATTERN.test(decodedValue) ? decodedValue : null;
}

// Mirrors profileLink.ts's parseNativeProfileLink shape, for the
// conversation-spectate public link instead of a profile link.
export function parseNativeConversationShareLink(
  rawValue: string,
  allowedHttpsOrigin: string,
): NativeConversationShareLink | null {
  const normalizedValue = rawValue.trim();
  if (!normalizedValue) return null;

  let url: URL;
  try {
    url = new URL(normalizedValue);
  } catch {
    return null;
  }

  if (CONVERSATION_SHARE_APP_SCHEMES.has(url.protocol)) {
    if (url.hostname !== CONVERSATION_SHARE_APP_SCHEME_HOST) return null;
    const shareToken = normalizeShareToken(url.pathname.replace(/^\//, ""));
    return shareToken ? { shareToken, source: "mingle" } : null;
  }

  if (url.protocol !== "https:") return null;
  let configuredOrigin: string;
  try {
    configuredOrigin = new URL(allowedHttpsOrigin).origin;
  } catch {
    return null;
  }
  if (url.origin !== configuredOrigin) return null;

  const match = url.pathname.match(/^\/s\/([^/]+)\/?$/);
  const shareToken = match ? normalizeShareToken(match[1]) : null;
  return shareToken ? { shareToken, source: "https" } : null;
}

export type NativeConversationShareWebUrlOptions = {
  baseUrl: string;
  shareToken: string;
};

// The spectate page (/s/[shareToken]) is the same read-only page for
// everyone, member or not, app or web — unlike profile links there's no
// separate "authenticated in-app" destination to build here.
export function buildNativeConversationShareWebUrl({
  baseUrl,
  shareToken,
}: NativeConversationShareWebUrlOptions): string | null {
  const normalizedShareToken = normalizeShareToken(shareToken);
  if (!normalizedShareToken) return null;

  try {
    const base = new URL(baseUrl);
    if (base.protocol !== "http:" && base.protocol !== "https:") {
      return null;
    }
    const basePath = base.pathname.replace(/\/+$/, "");
    const destination = new URL(`${base.origin}${basePath}/s/${encodeURIComponent(normalizedShareToken)}`);
    destination.searchParams.set("nativeUi", "1");
    return destination.toString();
  } catch {
    return null;
  }
}

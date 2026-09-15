// Mirrors profile-link.ts's shape for the public conversation "spectate"
// link: a plain https path for the web landing page, plus a custom-scheme
// URL the RN app already listens for (mingle:// is registered generically at
// the OS level in Info.plist/AndroidManifest.xml, so no new URL scheme
// registration is needed — only a new host to recognize).
export const CONVERSATION_SHARE_LINK_PATH_PREFIX = "/s/";
export const CONVERSATION_SHARE_APP_SCHEME = "mingle";
export const CONVERSATION_SHARE_APP_FALLBACK_SCHEME = "mingleconversation";
export const CONVERSATION_SHARE_APP_SCHEME_HOST = "conversation-spectate";

export const CONVERSATION_SHARE_APP_SCHEMES = [
  CONVERSATION_SHARE_APP_SCHEME,
  CONVERSATION_SHARE_APP_FALLBACK_SCHEME,
] as const;

// shareToken is minted via crypto.randomBytes(16).toString("base64url") —
// see setConversationChannelSharing.
const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export type ParsedMingleConversationShareLink = {
  shareToken: string;
  source: "https" | "mingle";
};

export function normalizeConversationShareToken(rawValue: string): string | null {
  let decodedValue = rawValue.trim();
  try {
    decodedValue = decodeURIComponent(decodedValue);
  } catch {
    return null;
  }

  return SHARE_TOKEN_PATTERN.test(decodedValue) ? decodedValue : null;
}

export function isValidConversationShareToken(rawValue: string): boolean {
  return normalizeConversationShareToken(rawValue) !== null;
}

export function buildConversationShareLinkPath(shareToken: string): string | null {
  const normalizedToken = normalizeConversationShareToken(shareToken);
  if (!normalizedToken) return null;
  return `${CONVERSATION_SHARE_LINK_PATH_PREFIX}${encodeURIComponent(normalizedToken)}`;
}

export function buildConversationShareUrl(baseUrl: string, shareToken: string): string | null {
  const sharePath = buildConversationShareLinkPath(shareToken);
  if (!sharePath) return null;

  try {
    return new URL(sharePath, baseUrl).toString();
  } catch {
    return null;
  }
}

export function buildConversationShareAppUrl(
  shareToken: string,
  launchNonce?: string,
  scheme: (typeof CONVERSATION_SHARE_APP_SCHEMES)[number] = CONVERSATION_SHARE_APP_SCHEME,
): string | null {
  const normalizedToken = normalizeConversationShareToken(shareToken);
  if (!normalizedToken) return null;
  const normalizedScheme = CONVERSATION_SHARE_APP_SCHEMES.includes(scheme)
    ? scheme
    : CONVERSATION_SHARE_APP_SCHEME;
  const normalizedNonce = launchNonce?.trim();
  const query = normalizedNonce ? `?linkNonce=${encodeURIComponent(normalizedNonce)}` : "";
  return `${normalizedScheme}://${CONVERSATION_SHARE_APP_SCHEME_HOST}/${encodeURIComponent(normalizedToken)}${query}`;
}

function readSharePathToken(pathname: string): string | null {
  const match = pathname.match(/^\/s\/([^/]+)\/?$/);
  return match ? normalizeConversationShareToken(match[1]) : null;
}

function readMingleSchemeShareToken(url: URL): string | null {
  if (url.hostname !== CONVERSATION_SHARE_APP_SCHEME_HOST) return null;
  return normalizeConversationShareToken(url.pathname.replace(/^\//, ""));
}

export function parseMingleConversationShareLink(
  rawValue: string,
  allowedHttpsOrigins: readonly string[] = [],
): ParsedMingleConversationShareLink | null {
  const normalizedValue = rawValue.trim();
  if (!normalizedValue) return null;

  let url: URL;
  try {
    url = new URL(normalizedValue);
  } catch {
    return null;
  }

  if (CONVERSATION_SHARE_APP_SCHEMES.some((scheme) => url.protocol === `${scheme}:`)) {
    const shareToken = readMingleSchemeShareToken(url);
    return shareToken ? { shareToken, source: "mingle" } : null;
  }

  if (url.protocol !== "https:") return null;
  const allowedOrigins = new Set(
    allowedHttpsOrigins
      .map((origin) => {
        try {
          return new URL(origin).origin;
        } catch {
          return "";
        }
      })
      .filter(Boolean),
  );
  if (!allowedOrigins.has(url.origin)) return null;

  const shareToken = readSharePathToken(url.pathname);
  return shareToken ? { shareToken, source: "https" } : null;
}

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

export const NATIVE_CONVERSATION_SHARE_EVENT = "mingle:native-conversation-share";
export const NATIVE_CONVERSATION_SHARE_WINDOW_KEY = "__MINGLE_PENDING_NATIVE_CONVERSATION_SHARE";

export type NativeConversationShareOverlayRequest = {
  shareToken: string;
  linkNonce: string;
  navigationSequence: number;
};

// Mirrors profileLink.ts's buildNativeProfileLinkEventScript: dispatches a
// CustomEvent into the currently-loaded page (and stashes the same payload
// on window as a fallback for a listener that hasn't mounted yet) instead of
// navigating the WebView away, so NativeConversationShareOverlay can render
// an in-app view (the snapshot plus a join action) on top of whatever screen
// was already open.
export function buildNativeConversationShareEventScript(
  request: NativeConversationShareOverlayRequest,
): string {
  const serializedRequest = JSON.stringify(request);
  return `(function () { const detail = ${serializedRequest}; window[${JSON.stringify(NATIVE_CONVERSATION_SHARE_WINDOW_KEY)}] = detail; window.dispatchEvent(new CustomEvent(${JSON.stringify(NATIVE_CONVERSATION_SHARE_EVENT)}, { detail })); })(); true;`;
}

// RN's built-in URL polyfill (react-native/Libraries/Blob/URL.js) only
// parses hostname/pathname via regexes anchored on `https?://` — for any
// other scheme (like `mingle:`), `.hostname` is always "" and `.pathname`
// is always "/" no matter what the URL actually contains. Parse the
// authority and path manually for the custom-scheme branch instead of
// relying on those getters. (Mirrors profileLink.ts's identical helper.)
function parseCustomSchemeAuthorityAndPath(
  rawValue: string,
  protocol: string,
): { host: string; path: string } | null {
  if (!rawValue.startsWith(protocol)) return null;
  const afterScheme = rawValue.slice(protocol.length).replace(/^\/\//, "");
  const withoutQueryOrHash = afterScheme.split(/[?#]/)[0];
  const slashIndex = withoutQueryOrHash.indexOf("/");
  if (slashIndex === -1) return { host: withoutQueryOrHash, path: "" };
  return {
    host: withoutQueryOrHash.slice(0, slashIndex),
    path: withoutQueryOrHash.slice(slashIndex),
  };
}

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
    const authority = parseCustomSchemeAuthorityAndPath(normalizedValue, url.protocol);
    if (!authority || authority.host !== CONVERSATION_SHARE_APP_SCHEME_HOST) return null;
    const shareToken = normalizeShareToken(authority.path.replace(/^\//, ""));
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

// The spectate page (/s/[shareToken]) is the same snapshot page for
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

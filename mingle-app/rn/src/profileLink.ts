const PROFILE_LINK_USER_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const PROFILE_APP_SCHEME = "mingle:";
const PROFILE_APP_FALLBACK_SCHEME = "mingleprofile:";
const PROFILE_APP_SCHEME_HOST = "profile";
const PROFILE_APP_SCHEMES = new Set([
  PROFILE_APP_SCHEME,
  PROFILE_APP_FALLBACK_SCHEME,
]);

export const NATIVE_PROFILE_LINK_EVENT = "mingle:native-profile-link";
export const NATIVE_PROFILE_LINK_WINDOW_KEY = "__MINGLE_PENDING_NATIVE_PROFILE_LINK";

export type NativeProfileLink = {
  userId: string;
  source: "https" | "mingle";
};

export type NativeProfileWebUrlOptions = {
  baseUrl: string;
  locale: string;
  userId: string;
  apiNamespace?: string;
  nativeStt?: boolean;
  linkNonce?: string;
};

export type NativeProfileLinkOverlayRequest = {
  userId: string;
  linkNonce: string;
  navigationSequence: number;
};

export function buildNativeProfileLinkEventScript(
  request: NativeProfileLinkOverlayRequest,
): string {
  const serializedRequest = JSON.stringify(request);
  return `(function () { const detail = ${serializedRequest}; window[${JSON.stringify(NATIVE_PROFILE_LINK_WINDOW_KEY)}] = detail; window.dispatchEvent(new CustomEvent(${JSON.stringify(NATIVE_PROFILE_LINK_EVENT)}, { detail })); })(); true;`;
}

// RN's built-in URL polyfill (react-native/Libraries/Blob/URL.js) only
// parses hostname/pathname via regexes anchored on `https?://` — for any
// other scheme (like `mingle:`), `.hostname` is always "" and `.pathname`
// is always "/" no matter what the URL actually contains. Parse the
// authority and path manually for the custom-scheme branch instead of
// relying on those getters.
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

function normalizeUserId(rawValue: string): string | null {
  let decodedValue = rawValue.trim();
  try {
    decodedValue = decodeURIComponent(decodedValue);
  } catch {
    return null;
  }

  return PROFILE_LINK_USER_ID_PATTERN.test(decodedValue) ? decodedValue : null;
}

export function buildNativeProfileWebUrl({
  baseUrl,
  locale,
  userId,
  apiNamespace,
  nativeStt,
  linkNonce,
}: NativeProfileWebUrlOptions): string | null {
  const normalizedUserId = normalizeUserId(userId);
  const normalizedLocale = locale.trim().replace(/^\/+|\/+$/g, "");
  if (!normalizedUserId || !normalizedLocale) return null;

  let destination: URL;
  try {
    const base = new URL(baseUrl);
    if (base.protocol !== "http:" && base.protocol !== "https:") {
      return null;
    }
    const basePath = base.pathname.replace(/\/+$/, "");
    destination = new URL(
      `${base.origin}${basePath}/${encodeURIComponent(normalizedLocale)}/users/${encodeURIComponent(normalizedUserId)}`,
    );
  } catch {
    return null;
  }

  destination.searchParams.set("nativeUi", "1");
  destination.searchParams.set("nativeAuth", "1");
  if (apiNamespace?.trim()) {
    destination.searchParams.set("apiNamespace", apiNamespace.trim());
  }
  if (typeof nativeStt === "boolean") {
    destination.searchParams.set("nativeStt", nativeStt ? "1" : "0");
  }
  if (linkNonce?.trim()) {
    destination.searchParams.set("profileLinkNonce", linkNonce.trim());
  }

  return destination.toString();
}

export function parseNativeProfileLink(rawValue: string, allowedHttpsOrigin: string): NativeProfileLink | null {
  const normalizedValue = rawValue.trim();
  if (!normalizedValue) return null;

  let url: URL;
  try {
    url = new URL(normalizedValue);
  } catch {
    return null;
  }

  if (PROFILE_APP_SCHEMES.has(url.protocol)) {
    const authority = parseCustomSchemeAuthorityAndPath(normalizedValue, url.protocol);
    if (!authority || authority.host !== PROFILE_APP_SCHEME_HOST) return null;
    const userId = normalizeUserId(authority.path.replace(/^\//, ""));
    return userId ? { userId, source: "mingle" } : null;
  }

  if (url.protocol !== "https:") return null;
  let configuredOrigin: string;
  try {
    configuredOrigin = new URL(allowedHttpsOrigin).origin;
  } catch {
    return null;
  }
  if (url.origin !== configuredOrigin) return null;

  const match = url.pathname.match(/^\/p\/([^/]+)\/?$/);
  const userId = match ? normalizeUserId(match[1]) : null;
  return userId ? { userId, source: "https" } : null;
}

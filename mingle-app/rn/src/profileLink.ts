const PROFILE_LINK_USER_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const PROFILE_APP_SCHEME = "mingle:";
const PROFILE_APP_FALLBACK_SCHEME = "mingleprofile:";
const PROFILE_APP_SCHEME_HOST = "profile";
const PROFILE_APP_SCHEMES = new Set([
  PROFILE_APP_SCHEME,
  PROFILE_APP_FALLBACK_SCHEME,
]);

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
    if (url.hostname !== PROFILE_APP_SCHEME_HOST) return null;
    const userId = normalizeUserId(url.pathname.replace(/^\//, ""));
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

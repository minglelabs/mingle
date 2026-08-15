const PROFILE_LINK_USER_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const PROFILE_APP_SCHEME = "mingle:";
const PROFILE_APP_SCHEME_HOST = "profile";

export type NativeProfileLink = {
  userId: string;
  source: "https" | "mingle";
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

export function parseNativeProfileLink(rawValue: string, allowedHttpsOrigin: string): NativeProfileLink | null {
  const normalizedValue = rawValue.trim();
  if (!normalizedValue) return null;

  let url: URL;
  try {
    url = new URL(normalizedValue);
  } catch {
    return null;
  }

  if (url.protocol === PROFILE_APP_SCHEME) {
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

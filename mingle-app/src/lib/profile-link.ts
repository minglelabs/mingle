export const PROFILE_LINK_PATH_PREFIX = "/p/";
export const PROFILE_APP_SCHEME = "mingle";
export const PROFILE_APP_FALLBACK_SCHEME = "mingleprofile";
export const PROFILE_APP_SCHEME_HOST = "profile";

export const PROFILE_APP_SCHEMES = [
  PROFILE_APP_SCHEME,
  PROFILE_APP_FALLBACK_SCHEME,
] as const;

const PROFILE_LINK_USER_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export type ParsedMingleProfileLink = {
  userId: string;
  source: "https" | "mingle";
};

export function normalizeProfileLinkUserId(rawValue: string): string | null {
  let decodedValue = rawValue.trim();
  try {
    decodedValue = decodeURIComponent(decodedValue);
  } catch {
    return null;
  }

  return PROFILE_LINK_USER_ID_PATTERN.test(decodedValue) ? decodedValue : null;
}

export function isValidProfileLinkUserId(rawValue: string): boolean {
  return normalizeProfileLinkUserId(rawValue) !== null;
}

export function buildProfileLinkPath(userId: string): string | null {
  const normalizedUserId = normalizeProfileLinkUserId(userId);
  if (!normalizedUserId) return null;
  return `${PROFILE_LINK_PATH_PREFIX}${encodeURIComponent(normalizedUserId)}`;
}

export function buildProfileLinkUrl(baseUrl: string, userId: string): string | null {
  const profilePath = buildProfileLinkPath(userId);
  if (!profilePath) return null;

  try {
    return new URL(profilePath, baseUrl).toString();
  } catch {
    return null;
  }
}

export function buildProfileAppUrl(
  userId: string,
  launchNonce?: string,
  scheme: (typeof PROFILE_APP_SCHEMES)[number] = PROFILE_APP_SCHEME,
): string | null {
  const normalizedUserId = normalizeProfileLinkUserId(userId);
  if (!normalizedUserId) return null;
  const normalizedScheme = PROFILE_APP_SCHEMES.includes(scheme)
    ? scheme
    : PROFILE_APP_SCHEME;
  const normalizedNonce = launchNonce?.trim();
  const query = normalizedNonce ? `?linkNonce=${encodeURIComponent(normalizedNonce)}` : "";
  return `${normalizedScheme}://${PROFILE_APP_SCHEME_HOST}/${encodeURIComponent(normalizedUserId)}${query}`;
}

function readProfilePathUserId(pathname: string): string | null {
  const match = pathname.match(/^\/p\/([^/]+)\/?$/);
  return match ? normalizeProfileLinkUserId(match[1]) : null;
}

function readMingleSchemeUserId(url: URL): string | null {
  if (url.hostname !== PROFILE_APP_SCHEME_HOST) return null;
  return normalizeProfileLinkUserId(url.pathname.replace(/^\//, ""));
}

export function parseMingleProfileLink(
  rawValue: string,
  allowedHttpsOrigins: readonly string[] = [],
): ParsedMingleProfileLink | null {
  const normalizedValue = rawValue.trim();
  if (!normalizedValue) return null;

  let url: URL;
  try {
    url = new URL(normalizedValue);
  } catch {
    return null;
  }

  if (PROFILE_APP_SCHEMES.some((scheme) => url.protocol === `${scheme}:`)) {
    const userId = readMingleSchemeUserId(url);
    return userId ? { userId, source: "mingle" } : null;
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

  const userId = readProfilePathUserId(url.pathname);
  return userId ? { userId, source: "https" } : null;
}

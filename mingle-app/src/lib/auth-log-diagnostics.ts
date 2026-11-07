import { createDecipheriv, hkdfSync } from "node:crypto";
import { decode as decodeNextAuthJwt, type JWT, type JWTDecodeParams } from "next-auth/jwt";

function clean(value: unknown, maxLength = 180): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maxLength) || "-";
}

function describeError(error: Error): string {
  // jose claim errors (JWTExpired, JWTClaimValidationFailed) carry code/claim/reason as
  // own fields, but `message` is not enumerable, so read every field by name.
  const fields = error as Error & { code?: unknown; claim?: unknown; reason?: unknown };
  const parts = [`name=${clean(error.name)}`];
  if (fields.code !== undefined) parts.push(`errCode=${clean(fields.code)}`);
  if (fields.claim !== undefined) parts.push(`claim=${clean(fields.claim)}`);
  if (fields.reason !== undefined) parts.push(`reason=${clean(fields.reason)}`);
  parts.push(`error="${clean(error.message)}"`);
  return parts.join(" ");
}

export function summarizeAuthLogMeta(rawValue: unknown): string {
  if (!rawValue || typeof rawValue !== "object") return "-";
  const entry = rawValue as Record<string, unknown>;
  const keys = Object.keys(entry).slice(0, 8).join(",") || "-";
  // NextAuth passes some errors as the metadata itself (e.g. JWT_SESSION_ERROR).
  if (rawValue instanceof Error) return `keys=${keys} ${describeError(rawValue)}`;
  const errorValue = entry.error;
  if (errorValue instanceof Error) return `keys=${keys} ${describeError(errorValue)}`;
  if (typeof errorValue === "string") return `keys=${keys} error="${clean(errorValue)}"`;
  return `keys=${keys}`;
}

type UnverifiedSessionClaims = { iat?: number; exp?: number; sub?: string };

function base64UrlToBuffer(value: string): Buffer {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

/**
 * Reads a NextAuth v4 session token (JWE dir + A256GCM) without checking its claims,
 * so a rejected token can still say when it was issued and when it expired.
 * Only for logging: never trust what this returns.
 */
export function readSessionPayloadUnverified(
  token: string,
  secret: string,
  salt = "",
): Record<string, unknown> | null {
  try {
    const [protectedHeader, encryptedKey, iv, ciphertext, tag] = token.split(".");
    if (!protectedHeader || encryptedKey !== "" || !iv || !ciphertext || !tag) return null;
    const key = Buffer.from(hkdfSync(
      "sha256",
      secret,
      salt,
      `NextAuth.js Generated Encryption Key${salt ? ` (${salt})` : ""}`,
      32,
    ));
    const decipher = createDecipheriv("aes-256-gcm", key, base64UrlToBuffer(iv));
    decipher.setAAD(Buffer.from(protectedHeader, "ascii"));
    decipher.setAuthTag(base64UrlToBuffer(tag));
    const plaintext = Buffer.concat([decipher.update(base64UrlToBuffer(ciphertext)), decipher.final()]);
    return JSON.parse(plaintext.toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function readSessionClaimsUnverified(
  token: string,
  secret: string,
  salt = "",
): UnverifiedSessionClaims | null {
  const payload = readSessionPayloadUnverified(token, secret, salt);
  if (!payload) return null;
  return {
    iat: typeof payload.iat === "number" ? payload.iat : undefined,
    exp: typeof payload.exp === "number" ? payload.exp : undefined,
    sub: typeof payload.sub === "string" ? payload.sub : undefined,
  };
}

function formatEpochSeconds(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  const date = new Date(value * 1000);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

export function describeSessionDecodeFailure(
  params: Pick<JWTDecodeParams, "token" | "secret" | "salt">,
  error: unknown,
  nowEpochSeconds = Math.floor(Date.now() / 1000),
): string {
  const parts = [error instanceof Error ? describeError(error) : `error="${clean(error)}"`];
  const token = params.token ?? "";
  parts.push(`tokenLength=${token.length}`);
  const secret = Array.isArray(params.secret) ? params.secret[0] : params.secret;
  const claims = token && typeof secret === "string"
    ? readSessionClaimsUnverified(token, secret, params.salt ?? "")
    : null;
  if (!claims) {
    parts.push("claims=unreadable");
    return parts.join(" ");
  }
  parts.push(`sub=${clean(claims.sub, 64)}`);
  parts.push(`iat=${formatEpochSeconds(claims.iat)}`);
  parts.push(`exp=${formatEpochSeconds(claims.exp)}`);
  if (typeof claims.iat === "number") {
    parts.push(`ageDays=${((nowEpochSeconds - claims.iat) / 86_400).toFixed(1)}`);
  }
  if (typeof claims.exp === "number") {
    parts.push(`expiredDaysAgo=${((nowEpochSeconds - claims.exp) / 86_400).toFixed(1)}`);
  }
  return parts.join(" ");
}

// Before jwt.maxAge was set, sign-in tokens were issued with NextAuth's 30-day default while
// the cookie lived on, so users were signed out against the intent that a session lasts until
// sign-out. A token that expired within this window and was issued with exactly that default
// lifetime is still honoured. The AES-GCM tag has already proven that we issued it.
const LEGACY_TOKEN_LIFETIME_SECONDS = 30 * 24 * 60 * 60;
const LEGACY_TOKEN_GRACE_SECONDS = 180 * 24 * 60 * 60;
const graceLoggedSubs = new Set<string>();

function isExpiredError(error: unknown): boolean {
  return error instanceof Error && (error as Error & { code?: unknown }).code === "ERR_JWT_EXPIRED";
}

export function acceptLegacyExpiredSession(
  params: Pick<JWTDecodeParams, "token" | "secret" | "salt">,
  nowEpochSeconds = Math.floor(Date.now() / 1000),
): JWT | null {
  const secret = Array.isArray(params.secret) ? params.secret[0] : params.secret;
  if (!params.token || typeof secret !== "string") return null;
  const payload = readSessionPayloadUnverified(params.token, secret, params.salt ?? "");
  if (!payload) return null;
  const { iat, exp } = payload;
  if (typeof iat !== "number" || typeof exp !== "number") return null;
  if (exp - iat !== LEGACY_TOKEN_LIFETIME_SECONDS) return null;
  if (nowEpochSeconds - exp > LEGACY_TOKEN_GRACE_SECONDS) return null;
  return payload as JWT;
}

/** NextAuth's own decode, plus a grace period for legacy tokens and a log line for rejected ones. */
export async function decodeSessionTokenWithDiagnostics(params: JWTDecodeParams) {
  try {
    return await decodeNextAuthJwt(params);
  } catch (error) {
    if (isExpiredError(error)) {
      const accepted = acceptLegacyExpiredSession(params);
      if (accepted) {
        const sub = typeof accepted.sub === "string" ? accepted.sub : "-";
        if (!graceLoggedSubs.has(sub) && graceLoggedSubs.size < 5000) {
          graceLoggedSubs.add(sub);
          console.warn(`[nextauth:jwt-legacy-accepted] ${describeSessionDecodeFailure(params, error)}`);
        }
        return accepted;
      }
    }
    console.error(`[nextauth:jwt-decode-failed] ${describeSessionDecodeFailure(params, error)}`);
    throw error;
  }
}

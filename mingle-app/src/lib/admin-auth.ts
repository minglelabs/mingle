import { createHmac, createHash, timingSafeEqual } from "crypto";

export const ADMIN_SESSION_COOKIE_NAME = "mingle_admin_session";
export const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 365 * 20;

type AdminAuthConfig = {
  username: string;
  password: string;
  signingSecret: string;
};

function normalizeUsername(rawValue: unknown): string {
  if (typeof rawValue !== "string") return "";
  return rawValue.trim();
}

function readPassword(rawValue: unknown): string {
  return typeof rawValue === "string" ? rawValue : "";
}

function hashForCompare(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

function safeEqualString(left: string, right: string): boolean {
  return timingSafeEqual(hashForCompare(left), hashForCompare(right));
}

function readAdminAuthConfig(): AdminAuthConfig | null {
  const username = normalizeUsername(process.env.MINGLE_ADMIN_USERNAME);
  const password = readPassword(process.env.MINGLE_ADMIN_PASSWORD);
  if (!username || !password) return null;

  return {
    username,
    password,
    signingSecret: process.env.AUTH_SECRET || password,
  };
}

function buildAdminSessionToken(config: AdminAuthConfig): string {
  const signature = createHmac("sha256", config.signingSecret)
    .update(`mingle-admin-session:v1:${config.username}:${config.password}`)
    .digest("base64url");
  return `v1.${signature}`;
}

export function isAdminAuthConfigured(): boolean {
  return Boolean(readAdminAuthConfig());
}

export function verifyAdminLogin(username: unknown, password: unknown): boolean {
  const config = readAdminAuthConfig();
  if (!config) return false;

  const candidateUsername = normalizeUsername(username);
  const candidatePassword = readPassword(password);
  return (
    safeEqualString(candidateUsername, config.username)
    && safeEqualString(candidatePassword, config.password)
  );
}

export function createAdminSessionToken(): string | null {
  const config = readAdminAuthConfig();
  if (!config) return null;
  return buildAdminSessionToken(config);
}

export function verifyAdminSessionToken(token: unknown): boolean {
  if (typeof token !== "string" || !token) return false;

  const config = readAdminAuthConfig();
  if (!config) return false;

  return safeEqualString(token, buildAdminSessionToken(config));
}

import { createHash, timingSafeEqual } from "crypto";

/**
 * Admin login credentials and the login throttle.
 *
 * The credential is the env pair MINGLE_ADMIN_USERNAME / MINGLE_ADMIN_PASSWORD
 * (login is off while either is empty). A successful login starts a DB
 * session (`src/server/admin/session.ts`); there is no token derived from the
 * credential any more, so an old cookie stops working and staff sign in once.
 */
export const ADMIN_SESSION_COOKIE_NAME = "mingle_admin_session";

type AdminAuthConfig = {
  username: string;
  password: string;
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
  return { username, password };
}

export function isAdminAuthConfigured(): boolean {
  return Boolean(readAdminAuthConfig());
}

export function verifyAdminLogin(username: unknown, password: unknown): boolean {
  const config = readAdminAuthConfig();
  if (!config) return false;

  const candidateUsername = normalizeUsername(username);
  const candidatePassword = readPassword(password);
  // Compare both, always: no early exit that would time the username check.
  const usernameMatches = safeEqualString(candidateUsername, config.username);
  const passwordMatches = safeEqualString(candidatePassword, config.password);
  return usernameMatches && passwordMatches;
}

export const ADMIN_LOGIN_MAX_FAILURES = 5;
export const ADMIN_LOGIN_FAILURE_WINDOW_MS = 15 * 60 * 1000;
/** Bound on tracked keys, so a flood of distinct IPs cannot grow the map without limit. */
const ADMIN_LOGIN_MAX_TRACKED_KEYS = 5_000;

export type AdminLoginThrottle = {
  /** True while `key` has ADMIN_LOGIN_MAX_FAILURES failures inside the window. */
  isThrottled(key: string, now?: number): boolean;
  /** Records one failed attempt; returns true when that failure reaches the limit. */
  recordFailure(key: string, now?: number): boolean;
  /** Forgets a key's failures (after a successful login). */
  clear(key: string): void;
  reset(): void;
};

/**
 * Sliding-window failure counter per client key (the request IP). In memory,
 * which is enough for the single Railway replica (same assumption as
 * `src/server/rate-limit/rate-limit.ts`). A refused (throttled) attempt is not
 * counted, so the lock lifts 15 minutes after the oldest counted failure.
 */
export function createAdminLoginThrottle(): AdminLoginThrottle {
  const failures = new Map<string, number[]>();

  function recent(key: string, now: number): number[] {
    const stored = failures.get(key);
    if (!stored) return [];
    const fresh = stored.filter((at) => now - at < ADMIN_LOGIN_FAILURE_WINDOW_MS);
    if (fresh.length === 0) failures.delete(key);
    else if (fresh.length !== stored.length) failures.set(key, fresh);
    return fresh;
  }

  return {
    isThrottled(key, now = Date.now()) {
      return recent(key, now).length >= ADMIN_LOGIN_MAX_FAILURES;
    },
    recordFailure(key, now = Date.now()) {
      const next = [...recent(key, now), now].slice(-ADMIN_LOGIN_MAX_FAILURES);
      // Re-insert so Map order tracks recency; evict the stalest keys past the bound.
      failures.delete(key);
      failures.set(key, next);
      while (failures.size > ADMIN_LOGIN_MAX_TRACKED_KEYS) {
        const stalest = failures.keys().next().value;
        if (stalest === undefined) break;
        failures.delete(stalest);
      }
      return next.length >= ADMIN_LOGIN_MAX_FAILURES;
    },
    clear(key) {
      failures.delete(key);
    },
    reset() {
      failures.clear();
    },
  };
}

export const adminLoginThrottle = createAdminLoginThrottle();

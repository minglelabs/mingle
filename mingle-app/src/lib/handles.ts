export const HANDLE_MAX_LENGTH = 30;
export const HANDLE_PATTERN = /^[A-Za-z0-9_.]+$/;
export const ANONYMOUS_HANDLE_PREFIX = "anon_";
export const RESERVED_SEARCH_HANDLE = "admin";

export function isAnonymousTrackingHandle(value: unknown): boolean {
  return typeof value === "string"
    && value.trim().toLowerCase().startsWith(ANONYMOUS_HANDLE_PREFIX);
}

export function isSearchExcludedHandle(value: unknown): boolean {
  if (typeof value !== "string") return false;

  const normalized = value.trim().toLowerCase();
  return normalized === RESERVED_SEARCH_HANDLE || normalized.startsWith(ANONYMOUS_HANDLE_PREFIX);
}

export type DefaultHandleInput = {
  id?: string | null;
  name?: string | null;
  email?: string | null;
};

export type HandleNormalization = {
  value: string | null;
  valid: boolean;
};

export function normalizeHandle(value: unknown): HandleNormalization {
  if (value === null) return { value: null, valid: true };
  if (typeof value !== "string") return { value: null, valid: false };

  const normalized = value.trim().toLowerCase();
  if (!normalized) return { value: null, valid: true };
  if (normalized.length > HANDLE_MAX_LENGTH || !HANDLE_PATTERN.test(normalized)) {
    return { value: null, valid: false };
  }

  return { value: normalized, valid: true };
}

function sanitizeHandleSource(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9_.]/g, "");
}

/**
 * Builds the first public handle for accounts that do not choose one yet.
 * The display name is preferred so the initial profile remains recognizable;
 * email and external id provide safe fallbacks for names without ASCII chars.
 */
export function buildDefaultHandle(input: DefaultHandleInput): string {
  const name = typeof input.name === "string" ? sanitizeHandleSource(input.name) : "";
  const emailLocalPart = typeof input.email === "string"
    ? sanitizeHandleSource(input.email.split("@", 1)[0] || "")
    : "";
  const id = typeof input.id === "string" ? sanitizeHandleSource(input.id) : "";
  const candidate = name || emailLocalPart || id || "user";

  return candidate.slice(0, HANDLE_MAX_LENGTH) || "user";
}

// 8 base-36 characters from the whole address. The tail of an address is no
// suffix: every @gmail.com (or @mingle.test) account ends in the same 8
// characters, so two people with one name used to collide on every candidate.
function emailHandleSuffix(email: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (const char of email.trim().toLowerCase()) {
    const code = char.codePointAt(0) ?? 0;
    a = Math.imul(a ^ code, 0x01000193) >>> 0;
    b = Math.imul(b ^ code, 0x5bd1e995) >>> 0;
  }
  return `${a.toString(36)}${b.toString(36)}`.padStart(8, "0").slice(-8);
}

function randomHandleSuffix(): string {
  return Math.floor(Math.random() * 36 ** 8).toString(36).padStart(8, "0");
}

export function buildDefaultHandleCandidates(input: DefaultHandleInput, random: () => string = randomHandleSuffix): string[] {
  const base = buildDefaultHandle(input);
  const id = typeof input.id === "string" ? sanitizeHandleSource(input.id.trim()) : "";
  const email = typeof input.email === "string" ? input.email.trim() : "";
  const suffix = id ? id.slice(-8) : email ? emailHandleSuffix(email) : "";
  const withSuffix = (head: string, tail: string) => `${head.slice(0, HANDLE_MAX_LENGTH - tail.length - 1)}_${tail}`;
  // A random last resort, so a taken name never fails the sign-up.
  const last = random();
  const candidates = suffix
    ? [base, withSuffix(base, suffix), `user_${suffix}`.slice(0, HANDLE_MAX_LENGTH), withSuffix(base, last)]
    : [base, withSuffix(base, last)];
  return [...new Set(candidates)];
}

export function isHandleUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === "object"
    && "code" in error
    && error.code === "P2002",
  );
}

export async function createWithDefaultHandle<T>(
  input: DefaultHandleInput,
  create: (handle: string) => Promise<T>,
): Promise<T> {
  let lastError: unknown;
  for (const handle of buildDefaultHandleCandidates(input)) {
    try {
      return await create(handle);
    } catch (error) {
      if (!isHandleUniqueConstraintError(error)) throw error;
      lastError = error;
    }
  }

  throw lastError ?? new Error("default_handle_unavailable");
}

export function formatHandle(handle: string | null | undefined): string {
  const normalized = typeof handle === "string" ? handle.trim() : "";
  return normalized ? `@${normalized}` : "";
}

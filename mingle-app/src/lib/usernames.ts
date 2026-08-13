export const USERNAME_MAX_LENGTH = 30;
export const USERNAME_PATTERN = /^[A-Za-z0-9_.]+$/;

export type DefaultUsernameInput = {
  id?: string | null;
  name?: string | null;
  email?: string | null;
};

export type UsernameNormalization = {
  value: string | null;
  valid: boolean;
};

export function normalizeUsername(value: unknown): UsernameNormalization {
  if (value === null) return { value: null, valid: true };
  if (typeof value !== "string") return { value: null, valid: false };

  const normalized = value.trim().toLowerCase();
  if (!normalized) return { value: null, valid: true };
  if (normalized.length > USERNAME_MAX_LENGTH || !USERNAME_PATTERN.test(normalized)) {
    return { value: null, valid: false };
  }

  return { value: normalized, valid: true };
}

function sanitizeUsernameSource(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9_.]/g, "");
}

/**
 * Builds the first public username for accounts that do not choose one yet.
 * The display name is preferred so the initial profile remains recognizable;
 * email and external id provide safe fallbacks for names without ASCII chars.
 */
export function buildDefaultUsername(input: DefaultUsernameInput): string {
  const name = typeof input.name === "string" ? sanitizeUsernameSource(input.name) : "";
  const emailLocalPart = typeof input.email === "string"
    ? sanitizeUsernameSource(input.email.split("@", 1)[0] || "")
    : "";
  const id = typeof input.id === "string" ? sanitizeUsernameSource(input.id) : "";
  const candidate = name || emailLocalPart || id || "user";

  return candidate.slice(0, USERNAME_MAX_LENGTH) || "user";
}

export function buildDefaultUsernameCandidates(input: DefaultUsernameInput): string[] {
  const base = buildDefaultUsername(input);
  const uniqueSource = sanitizeUsernameSource(
    typeof input.id === "string" && input.id.trim()
      ? input.id
      : typeof input.email === "string" ? input.email : "",
  );
  if (!uniqueSource) return [base];

  const suffix = uniqueSource.slice(-8);
  const withSource = `${base.slice(0, USERNAME_MAX_LENGTH - suffix.length - 1)}_${suffix}`;
  const fallback = `user_${suffix}`.slice(0, USERNAME_MAX_LENGTH);

  return [...new Set([base, withSource, fallback])];
}

export function isUsernameUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === "object"
    && "code" in error
    && error.code === "P2002",
  );
}

export async function createWithDefaultUsername<T>(
  input: DefaultUsernameInput,
  create: (username: string) => Promise<T>,
): Promise<T> {
  let lastError: unknown;
  for (const username of buildDefaultUsernameCandidates(input)) {
    try {
      return await create(username);
    } catch (error) {
      if (!isUsernameUniqueConstraintError(error)) throw error;
      lastError = error;
    }
  }

  throw lastError ?? new Error("default_username_unavailable");
}

export function formatUsername(username: string | null | undefined): string {
  const normalized = typeof username === "string" ? username.trim() : "";
  return normalized ? `@${normalized}` : "";
}

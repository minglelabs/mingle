export const HANDLE_MAX_LENGTH = 30;
export const HANDLE_PATTERN = /^[A-Za-z0-9_.]+$/;

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

export function buildDefaultHandleCandidates(input: DefaultHandleInput): string[] {
  const base = buildDefaultHandle(input);
  const uniqueSource = sanitizeHandleSource(
    typeof input.id === "string" && input.id.trim()
      ? input.id
      : typeof input.email === "string" ? input.email : "",
  );
  if (!uniqueSource) return [base];

  const suffix = uniqueSource.slice(-8);
  const withSource = `${base.slice(0, HANDLE_MAX_LENGTH - suffix.length - 1)}_${suffix}`;
  const fallback = `user_${suffix}`.slice(0, HANDLE_MAX_LENGTH);

  return [...new Set([base, withSource, fallback])];
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

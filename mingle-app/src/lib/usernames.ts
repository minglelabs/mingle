export const USERNAME_MAX_LENGTH = 30;
export const USERNAME_PATTERN = /^[A-Za-z0-9_.]+$/;

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

export function formatUsername(username: string | null | undefined): string {
  const normalized = typeof username === "string" ? username.trim() : "";
  return normalized ? `@${normalized}` : "";
}

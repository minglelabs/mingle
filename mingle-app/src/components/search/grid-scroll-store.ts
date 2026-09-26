"use client";

/**
 * Per-scope scroll-position memory for post grids, so returning from a
 * full-screen viewer (or a sliding profile) restores the grid to where the
 * user left it. Keyed by a caller-chosen scope string — e.g.
 * `profile:<authorId>`, `search-posts:<query>`, `mypage-grid`.
 *
 * sessionStorage-backed with an in-memory fallback, mirroring the existing
 * connect-search cache: it survives tab re-entry but is intentionally scoped to
 * the session, not persisted forever.
 */

const STORAGE_PREFIX = "mingle:grid-scroll:v1";
const memory = new Map<string, number>();

function storageKey(scope: string): string {
  return `${STORAGE_PREFIX}:${scope}`;
}

export function rememberGridScroll(scope: string, scrollTop: number): void {
  if (!scope || typeof scrollTop !== "number" || !Number.isFinite(scrollTop)) return;
  const value = Math.max(0, Math.round(scrollTop));
  memory.set(scope, value);
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(storageKey(scope), String(value));
  } catch {
    // In-memory value still covers same-session restores when storage is blocked.
  }
}

export function readGridScroll(scope: string): number {
  if (!scope) return 0;
  const inMemory = memory.get(scope);
  if (typeof inMemory === "number") return inMemory;
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.sessionStorage.getItem(storageKey(scope));
    if (raw == null) return 0;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    memory.set(scope, parsed);
    return parsed;
  } catch {
    return 0;
  }
}

export function clearGridScroll(scope: string): void {
  if (!scope) return;
  memory.delete(scope);
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(storageKey(scope));
  } catch {
    // Best-effort; clearing the in-memory value is enough for this session.
  }
}

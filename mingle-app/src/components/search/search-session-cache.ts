"use client";

import type { FeedPostDto } from "@/lib/feed-post-dto";
import type { ConnectSearchResult } from "@/components/connect-search-cache";

/**
 * Session snapshots that let a search (or grid) come back exactly as it was
 * after the user opened a post viewer / profile / "see all" and returned:
 * the same people rows and post tiles, without refetching or reflowing before
 * the scroll position is restored. sessionStorage-backed with an in-memory
 * fallback; entries expire so a stale result is never shown much later.
 */

const PREFIX = "mingle:search-snapshot:v1";
export const SNAPSHOT_MAX_AGE_MS = 10 * 60 * 1000;
const memory = new Map<string, string>();

type Envelope<T> = { savedAt: number; value: T };

function write<T>(key: string, value: T): void {
  const raw = JSON.stringify({ savedAt: Date.now(), value } satisfies Envelope<T>);
  memory.set(key, raw);
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(`${PREFIX}:${key}`, raw);
  } catch {
    // Quota/blocked storage: the in-memory copy still covers this session.
  }
}

function read<T>(key: string, now = Date.now()): T | null {
  let raw = memory.get(key) ?? null;
  if (raw == null && typeof window !== "undefined") {
    try {
      raw = window.sessionStorage.getItem(`${PREFIX}:${key}`);
    } catch {
      raw = null;
    }
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Envelope<T>;
    if (typeof parsed?.savedAt !== "number" || now - parsed.savedAt > SNAPSHOT_MAX_AGE_MS) return null;
    return parsed.value;
  } catch {
    return null;
  }
}

export type GridSnapshot = { posts: FeedPostDto[]; cursor: string | null };

export function rememberGridSnapshot(scope: string, snapshot: GridSnapshot): void {
  if (!scope) return;
  write(`grid:${scope}`, snapshot);
}

export function readGridSnapshot(scope: string, now?: number): GridSnapshot | null {
  if (!scope) return null;
  const value = read<GridSnapshot>(`grid:${scope}`, now);
  if (!value || !Array.isArray(value.posts)) return null;
  return { posts: value.posts, cursor: typeof value.cursor === "string" ? value.cursor : null };
}

export type PeopleSnapshot = { query: string; people: ConnectSearchResult[]; hasMore: boolean };

export function rememberPeopleSnapshot(snapshot: PeopleSnapshot): void {
  if (!snapshot.query) return;
  write(`people:${snapshot.query}`, snapshot);
}

export function readPeopleSnapshot(query: string, now?: number): PeopleSnapshot | null {
  if (!query) return null;
  const value = read<PeopleSnapshot>(`people:${query}`, now);
  if (!value || value.query !== query || !Array.isArray(value.people)) return null;
  return value;
}

/** Test hook. */
export function resetSearchSnapshotsForTest(): void {
  memory.clear();
}

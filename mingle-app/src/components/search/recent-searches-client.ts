"use client";

import { buildClientApiPath } from "@/lib/api-contract";

/** Client wrapper for `/api/search/recent`. All calls are best-effort. */

export type RecentSearch = {
  query: string;
  searchedAt: string;
};

type RecentSearchesResponse = { searches?: unknown };

function parseSearches(payload: RecentSearchesResponse): RecentSearch[] {
  if (!Array.isArray(payload.searches)) return [];
  return payload.searches.filter((entry): entry is RecentSearch =>
    Boolean(entry)
    && typeof entry === "object"
    && typeof (entry as RecentSearch).query === "string"
    && typeof (entry as RecentSearch).searchedAt === "string");
}

const ENDPOINT = "/search/recent" as const;

async function readSearches(response: Response): Promise<RecentSearch[]> {
  if (!response.ok) return [];
  return parseSearches((await response.json()) as RecentSearchesResponse);
}

export async function fetchRecentSearches(): Promise<RecentSearch[]> {
  try {
    return await readSearches(await fetch(buildClientApiPath(ENDPOINT), { cache: "no-store" }));
  } catch {
    return [];
  }
}

export async function recordRecentSearch(query: string): Promise<RecentSearch[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  try {
    return await readSearches(await fetch(buildClientApiPath(ENDPOINT), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: trimmed }),
    }));
  } catch {
    return [];
  }
}

export async function deleteRecentSearch(query: string): Promise<RecentSearch[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  try {
    return await readSearches(await fetch(
      buildClientApiPath(`${ENDPOINT}?q=${encodeURIComponent(trimmed)}` as `/${string}`),
      { method: "DELETE" },
    ));
  } catch {
    return [];
  }
}

export async function clearAllRecentSearches(): Promise<RecentSearch[]> {
  try {
    return await readSearches(await fetch(
      buildClientApiPath(`${ENDPOINT}?all=true` as `/${string}`),
      { method: "DELETE" },
    ));
  } catch {
    return [];
  }
}

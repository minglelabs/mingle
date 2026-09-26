/**
 * Recent-search service.
 *
 * Account-scoped recent search terms, shared across devices (stored in the DB,
 * not on the client). Newest first, at most 10, retained 30 days; a repeated
 * term updates its timestamp instead of duplicating. Prisma is injected so this
 * is unit-testable without a database, following the `*-service.test.ts`
 * pattern used elsewhere in the server layer.
 */

import type { PrismaClient } from "@prisma/client";

export const RECENT_SEARCH_LIMIT = 10;
export const RECENT_SEARCH_RETENTION_DAYS = 30;
export const RECENT_SEARCH_MAX_QUERY_LENGTH = 80;

const RETENTION_MS = RECENT_SEARCH_RETENTION_DAYS * 24 * 60 * 60 * 1000;

export type RecentSearchEntry = {
  query: string;
  searchedAt: string;
};

/** The slice of the Prisma client this service touches. */
export type RecentSearchPrisma = Pick<PrismaClient, "recentSearch">;

/** Trim, collapse inner whitespace and cap length. Returns "" when unusable. */
export function normalizeRecentSearchQuery(rawQuery: unknown): string {
  if (typeof rawQuery !== "string") return "";
  return rawQuery.trim().replace(/\s+/g, " ").slice(0, RECENT_SEARCH_MAX_QUERY_LENGTH);
}

export async function listRecentSearches(
  prisma: RecentSearchPrisma,
  userId: string,
  now: Date = new Date(),
): Promise<RecentSearchEntry[]> {
  const cutoff = new Date(now.getTime() - RETENTION_MS);
  const rows = await prisma.recentSearch.findMany({
    where: { userId, searchedAt: { gte: cutoff } },
    orderBy: { searchedAt: "desc" },
    take: RECENT_SEARCH_LIMIT,
    select: { query: true, searchedAt: true },
  });
  return rows.map((row) => ({
    query: row.query,
    searchedAt: row.searchedAt.toISOString(),
  }));
}

/**
 * Record a term the user actually searched (called by the client once a search
 * with a term has produced a result set). Upsert on the unique (userId, query)
 * so a repeat only refreshes `searchedAt`. A blank query is a no-op.
 */
export async function recordRecentSearch(
  prisma: RecentSearchPrisma,
  userId: string,
  rawQuery: string,
  now: Date = new Date(),
): Promise<string | null> {
  const query = normalizeRecentSearchQuery(rawQuery);
  if (!query) return null;

  await prisma.recentSearch.upsert({
    where: { userId_query: { userId, query } },
    create: { userId, query, searchedAt: now },
    update: { searchedAt: now },
  });
  return query;
}

/** Delete one term for the user. Returns the number of rows removed (0 or 1). */
export async function deleteRecentSearch(
  prisma: RecentSearchPrisma,
  userId: string,
  rawQuery: string,
): Promise<number> {
  const query = normalizeRecentSearchQuery(rawQuery);
  if (!query) return 0;
  const result = await prisma.recentSearch.deleteMany({ where: { userId, query } });
  return result.count;
}

/** Delete every term for the user. Returns the number of rows removed. */
export async function clearRecentSearches(
  prisma: RecentSearchPrisma,
  userId: string,
): Promise<number> {
  const result = await prisma.recentSearch.deleteMany({ where: { userId } });
  return result.count;
}

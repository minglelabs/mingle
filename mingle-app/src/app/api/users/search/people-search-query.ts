import { Prisma } from "@prisma/client";
import { ANONYMOUS_HANDLE_PREFIX, RESERVED_SEARCH_HANDLE } from "@/lib/handles";

/**
 * People search, ranked in SQL across the WHOLE match set (not per page):
 * exact match on name/handle (tier 0) → prefix (tier 1) → contains (tier 2),
 * then the people list's own order (updatedAt desc, id desc) inside a tier.
 * The tier mirrors `personMatchTier` in `@/lib/people-search-ranking`.
 *
 * Pagination is keyset on (tier asc, updatedAt desc, id desc), so page 2
 * continues exactly where page 1 stopped and an exact match can never be
 * pushed to a later page by a recently-updated contains match.
 *
 * Exclusions stay the same as the Prisma query they replace: inactive users,
 * the viewer, `anon_` handles, the reserved handle, and a block in either
 * direction.
 */

export type PeopleSearchCursor = {
  tier: number;
  updatedAt: Date;
  id: string;
};

export const MAX_PEOPLE_CURSOR_LENGTH = 512;

export function encodePeopleSearchCursor(cursor: PeopleSearchCursor): string {
  return Buffer.from(JSON.stringify({
    tier: cursor.tier,
    updatedAt: cursor.updatedAt.toISOString(),
    id: cursor.id,
  }), "utf8").toString("base64url");
}

/** `null` = first page; `"invalid"` = reject with 400 (includes pre-tier cursors). */
export function decodePeopleSearchCursor(rawCursor: string | null): PeopleSearchCursor | null | "invalid" {
  if (!rawCursor) return null;
  if (rawCursor.length > MAX_PEOPLE_CURSOR_LENGTH) return "invalid";
  try {
    const parsed = JSON.parse(Buffer.from(rawCursor, "base64url").toString("utf8")) as {
      tier?: unknown;
      updatedAt?: unknown;
      id?: unknown;
    };
    if (
      typeof parsed.tier !== "number"
      || !Number.isInteger(parsed.tier)
      || parsed.tier < 0
      || parsed.tier > 3
      || typeof parsed.updatedAt !== "string"
      || typeof parsed.id !== "string"
      || !parsed.id.trim()
    ) {
      return "invalid";
    }
    const updatedAt = new Date(parsed.updatedAt);
    if (Number.isNaN(updatedAt.getTime())) return "invalid";
    return { tier: parsed.tier, updatedAt, id: parsed.id };
  } catch {
    return "invalid";
  }
}

/** Escape LIKE metacharacters so `_`/`%` in a query match literally. */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export type PeopleSearchSqlInput = {
  viewerId: string;
  /** Trimmed raw query (may start with `@`). */
  query: string;
  /** Query without a leading `@` (non-empty). */
  handleQuery: string;
  cursor: PeopleSearchCursor | null;
  /** Rows to fetch (page size + 1 to detect another page). */
  take: number;
};

export type PeopleSearchRow = {
  id: string;
  tier: number;
  updatedAt: Date;
};

export function buildPeopleSearchSql({
  viewerId,
  query,
  handleQuery,
  cursor,
  take,
}: PeopleSearchSqlInput): Prisma.Sql {
  // Needles for tiering, lower-cased like personMatchTier (both the raw query
  // and, for `@…`, the handle part).
  const rawNeedle = query.trim().toLocaleLowerCase();
  const handleNeedle = handleQuery.trim().toLocaleLowerCase();
  const handlePattern = `%${escapeLikePattern(handleQuery)}%`;
  const namePattern = `%${escapeLikePattern(query)}%`;
  const anonPrefix = ANONYMOUS_HANDLE_PREFIX.toLowerCase();
  const reserved = RESERVED_SEARCH_HANDLE.toLowerCase();

  const fieldTier = (field: Prisma.Sql) => Prisma.sql`
    CASE
      WHEN ${field} = ${rawNeedle} OR ${field} = ${handleNeedle} THEN 0
      WHEN left(${field}, length(${rawNeedle})) = ${rawNeedle}
        OR left(${field}, length(${handleNeedle})) = ${handleNeedle} THEN 1
      WHEN strpos(${field}, ${rawNeedle}) > 0 OR strpos(${field}, ${handleNeedle}) > 0 THEN 2
      ELSE 3
    END`;
  const nameField = Prisma.sql`lower(btrim(coalesce(u.name, '')))`;
  const handleField = Prisma.sql`lower(btrim(u.handle))`;

  const cursorClause = cursor
    ? Prisma.sql`WHERE (
        ranked.tier > ${cursor.tier}
        OR (ranked.tier = ${cursor.tier} AND (
          ranked.updated_at < (${cursor.updatedAt.toISOString()}::timestamptz AT TIME ZONE 'UTC')
          OR (
            ranked.updated_at = (${cursor.updatedAt.toISOString()}::timestamptz AT TIME ZONE 'UTC')
            AND ranked.id < ${cursor.id}
          )
        ))
      )`
    : Prisma.empty;

  return Prisma.sql`
    SELECT ranked.id, ranked.tier, ranked.updated_at AS "updatedAt"
    FROM (
      SELECT
        u.id,
        u.updated_at,
        LEAST(${fieldTier(nameField)}, ${fieldTier(handleField)})::int AS tier
      FROM app_users u
      WHERE u.is_active = true
        AND u.id <> ${viewerId}
        AND left(lower(u.handle), ${anonPrefix.length}::int) <> ${anonPrefix}
        AND lower(u.handle) <> ${reserved}
        AND NOT EXISTS (
          SELECT 1 FROM app_user_blocks b WHERE b.blocker_id = u.id AND b.blocked_id = ${viewerId}
        )
        AND NOT EXISTS (
          SELECT 1 FROM app_user_blocks b WHERE b.blocker_id = ${viewerId} AND b.blocked_id = u.id
        )
        AND (
          u.handle ILIKE ${handlePattern} ESCAPE '\\'
          OR u.name ILIKE ${namePattern} ESCAPE '\\'
        )
    ) ranked
    ${cursorClause}
    ORDER BY ranked.tier ASC, ranked.updated_at DESC, ranked.id DESC
    LIMIT ${take}
  `;
}

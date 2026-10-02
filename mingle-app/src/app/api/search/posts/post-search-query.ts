import { Prisma } from '@prisma/client'

/**
 * Post search in SQL: filter, reaction-score ordering and paging all run in
 * the database, so a request reads one page of ids instead of every match.
 *
 * Semantics are those of the in-memory version this replaces:
 * - match: source text OR a `ready` translation of the CURRENT body version,
 *   case-insensitive substring (a stale-version translation does not match);
 * - visibility: the same rules as `visiblePostWhere` (public, not deleted, not
 *   moderation-hidden, author not hidden, no block either way, not hidden by
 *   the viewer). The route re-applies `visiblePostWhere` to the page rows, so
 *   that seam stays authoritative;
 * - order: reaction score (likes + unique non-author, non-deleted commenters
 *   ×2) desc, then publishedAt desc, then id desc.
 */

export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`)
}

export type PostSearchSqlInput = {
  viewerId: string | null
  query: string
  offset: number
  /** Rows to fetch (page size + 1 to detect another page). */
  take: number
}

export type PostSearchRow = { id: string }

export function buildPostSearchSql({ viewerId, query, offset, take }: PostSearchSqlInput): Prisma.Sql {
  const pattern = `%${escapeLikePattern(query)}%`
  const viewerClause = viewerId
    ? Prisma.sql`
        AND NOT EXISTS (
          SELECT 1 FROM app_user_blocks b WHERE b.blocker_id = ${viewerId} AND b.blocked_id = p.author_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM app_user_blocks b WHERE b.blocker_id = p.author_id AND b.blocked_id = ${viewerId}
        )
        AND NOT EXISTS (
          SELECT 1 FROM app_post_hides h WHERE h.post_id = p.id AND h.user_id = ${viewerId}
        )`
    : Prisma.empty

  return Prisma.sql`
    SELECT p.id
    FROM app_posts p
    JOIN app_users a ON a.id = p.author_id
    WHERE p.visibility = 'public'
      AND (p.is_deleted IS NULL OR p.is_deleted = false)
      AND p.moderation_hidden_at IS NULL
      AND a.moderation_hidden_at IS NULL
      ${viewerClause}
      AND (
        p.source_text ILIKE ${pattern} ESCAPE '\\'
        OR EXISTS (
          SELECT 1 FROM app_post_translations t
          WHERE t.post_id = p.id
            AND t.body_version = p.body_version
            AND t.status = 'ready'
            AND t.text ILIKE ${pattern} ESCAPE '\\'
        )
      )
    ORDER BY
      (
        p.like_count + 2 * (
          SELECT count(DISTINCT c.author_id)
          FROM app_post_comments c
          WHERE c.post_id = p.id
            AND (c.is_deleted IS NULL OR c.is_deleted = false)
            AND c.author_id <> p.author_id
        )
      ) DESC,
      p.published_at DESC,
      p.id DESC
    OFFSET ${offset}
    LIMIT ${take}
  `
}

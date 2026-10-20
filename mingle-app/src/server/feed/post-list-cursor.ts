/**
 * Opaque cursor + limit helpers for the post LIST endpoints that page by
 * `publishedAt DESC, id DESC` (profile grid, archive, trash, hidden). The home
 * feed keeps its own ranking cursor in `feed-ranking.ts`; search pages by a
 * numeric offset (see the search route) because it sorts by reaction score.
 *
 * Limits follow the same DEFAULT 10 / MAX 50 convention as the feed route.
 */

export const DEFAULT_LIST_LIMIT = 10
export const MAX_LIST_LIMIT = 50

/** Clamp a raw `?limit=` value into [1, MAX], defaulting when absent/invalid. */
export function parseListLimit(raw: string | null): number {
  if (raw === null) return DEFAULT_LIST_LIMIT
  const n = parseInt(raw, 10)
  if (!Number.isFinite(n) || n < 1) return DEFAULT_LIST_LIMIT
  return Math.min(n, MAX_LIST_LIMIT)
}

export type TimeCursor = {
  /** ISO 8601 publishedAt of the last item on the previous page. */
  publishedAt: string
  /** id of the last item on the previous page (tie-breaker). */
  id: string
}

export function encodeTimeCursor(cursor: TimeCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url')
}

export function decodeTimeCursor(raw: string | null): TimeCursor | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf-8'))
    if (typeof parsed?.publishedAt !== 'string' || typeof parsed?.id !== 'string') return null
    if (Number.isNaN(Date.parse(parsed.publishedAt))) return null
    return { publishedAt: parsed.publishedAt, id: parsed.id }
  } catch {
    return null
  }
}

/**
 * Prisma `where` fragment for "strictly older than the cursor" in a
 * `publishedAt DESC, id DESC` ordering. Returned under `AND` so it can be
 * spread into a `where` that already uses a top-level `OR` (e.g. the
 * not-deleted clause) without either overwriting the other.
 */
export function timeCursorWhere(cursor: TimeCursor | null) {
  if (!cursor) return {}
  const at = new Date(cursor.publishedAt)
  return {
    AND: [
      {
        OR: [
          { publishedAt: { lt: at } },
          { publishedAt: at, id: { lt: cursor.id } },
        ],
      },
    ],
  }
}

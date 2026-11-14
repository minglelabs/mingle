import { Prisma } from "@prisma/client";
import { ANONYMOUS_HANDLE_PREFIX, RESERVED_SEARCH_HANDLE } from "@/lib/handles";

/**
 * People discovery for the explore (탐색) tab: a grid of other users, Korean
 * speakers first for a foreigner and foreigners first for a Korean, newest
 * activity first inside each group.
 *
 * Ranked in SQL over the whole candidate set. `tier` packs the two ordering
 * keys before `lastSeenAt`:
 *   0 = other side + photo, 1 = other side, no photo,
 *   2 = same side + photo,  3 = same side, no photo.
 * Pagination is keyset on (tier asc, lastSeenAt desc, id desc).
 *
 * Excluded: the viewer, inactive / deleted users, admin-hidden or restricted
 * users (moderationHiddenAt / moderationRestrictedAt), `anon_` handles, the
 * reserved handle, and a block in either direction.
 */

export const NEW_USER_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const RECENTLY_ACTIVE_WINDOW_MS = 24 * 60 * 60 * 1000;
export const MAX_DISCOVERY_CURSOR_LENGTH = 512;

export type PeopleDiscoveryCursor = {
  tier: number;
  lastSeenAt: Date;
  id: string;
};

export type PeopleDiscoveryRow = {
  id: string;
  tier: number;
  lastSeenAt: Date;
};

/** The language facts that decide which side of the exchange a user is on. */
export type KoreanSideInput = {
  nationalityCountry?: string | null;
  nationality?: string | null;
  primaryLanguages?: readonly string[] | null;
};

/**
 * A user counts as Korean when their 국적 is KR or Korean is one of the
 * languages they speak (the legacy `nationality` language code included).
 * Returns null when the profile says nothing either way.
 */
export function resolveIsKoreanSide(user: KoreanSideInput): boolean | null {
  const country = user.nationalityCountry?.trim().toUpperCase() ?? "";
  const legacy = user.nationality?.trim().toLowerCase() ?? "";
  const primary = (user.primaryLanguages ?? []).map((code) => code.trim().toLowerCase()).filter(Boolean);
  if (country === "KR" || legacy === "ko" || primary.includes("ko")) return true;
  if (country || legacy || primary.length > 0) return false;
  return null;
}

/** The viewer's side, falling back to the UI locale when the profile is empty. */
export function resolveViewerIsKorean(viewer: KoreanSideInput | null, uiLocale: string | null): boolean {
  const fromProfile = viewer ? resolveIsKoreanSide(viewer) : null;
  if (fromProfile !== null) return fromProfile;
  return (uiLocale ?? "").trim().toLowerCase().split("-")[0] === "ko";
}

export function encodePeopleDiscoveryCursor(cursor: PeopleDiscoveryCursor): string {
  return Buffer.from(JSON.stringify({
    tier: cursor.tier,
    lastSeenAt: cursor.lastSeenAt.toISOString(),
    id: cursor.id,
  }), "utf8").toString("base64url");
}

/** `null` = first page; `"invalid"` = reject with 400. */
export function decodePeopleDiscoveryCursor(rawCursor: string | null): PeopleDiscoveryCursor | null | "invalid" {
  if (!rawCursor) return null;
  if (rawCursor.length > MAX_DISCOVERY_CURSOR_LENGTH) return "invalid";
  try {
    const parsed = JSON.parse(Buffer.from(rawCursor, "base64url").toString("utf8")) as {
      tier?: unknown;
      lastSeenAt?: unknown;
      id?: unknown;
    };
    if (
      typeof parsed.tier !== "number"
      || !Number.isInteger(parsed.tier)
      || parsed.tier < 0
      || parsed.tier > 3
      || typeof parsed.lastSeenAt !== "string"
      || typeof parsed.id !== "string"
      || !parsed.id.trim()
    ) {
      return "invalid";
    }
    const lastSeenAt = new Date(parsed.lastSeenAt);
    if (Number.isNaN(lastSeenAt.getTime())) return "invalid";
    return { tier: parsed.tier, lastSeenAt, id: parsed.id };
  } catch {
    return "invalid";
  }
}

export type PeopleDiscoverySqlInput = {
  viewerId: string;
  /** Which side the viewer is on; the other side is ranked first. */
  viewerIsKorean: boolean;
  cursor: PeopleDiscoveryCursor | null;
  /** Rows to fetch (page size + 1 to detect another page). */
  take: number;
};

export function buildPeopleDiscoverySql({
  viewerId,
  viewerIsKorean,
  cursor,
  take,
}: PeopleDiscoverySqlInput): Prisma.Sql {
  const anonPrefix = ANONYMOUS_HANDLE_PREFIX.toLowerCase();
  const reserved = RESERVED_SEARCH_HANDLE.toLowerCase();
  const isKorean = Prisma.sql`(
    upper(coalesce(u.nationality_country, '')) = 'KR'
    OR lower(coalesce(u.nationality, '')) = 'ko'
    OR 'ko' = ANY(u.primary_languages)
  )`;
  // Other side first: a Korean viewer ranks non-Koreans first and vice versa.
  const sideRank = viewerIsKorean
    ? Prisma.sql`CASE WHEN ${isKorean} THEN 2 ELSE 0 END`
    : Prisma.sql`CASE WHEN ${isKorean} THEN 0 ELSE 2 END`;
  const photoRank = Prisma.sql`CASE WHEN coalesce(btrim(u.image), '') <> '' THEN 0 ELSE 1 END`;

  const cursorClause = cursor
    ? Prisma.sql`WHERE (
        ranked.tier > ${cursor.tier}
        OR (ranked.tier = ${cursor.tier} AND (
          ranked.last_seen_at < (${cursor.lastSeenAt.toISOString()}::timestamptz AT TIME ZONE 'UTC')
          OR (
            ranked.last_seen_at = (${cursor.lastSeenAt.toISOString()}::timestamptz AT TIME ZONE 'UTC')
            AND ranked.id < ${cursor.id}
          )
        ))
      )`
    : Prisma.empty;

  return Prisma.sql`
    SELECT ranked.id, ranked.tier, ranked.last_seen_at AS "lastSeenAt"
    FROM (
      SELECT
        u.id,
        u.last_seen_at,
        (${sideRank} + ${photoRank})::int AS tier
      FROM app.app_users u
      WHERE u.is_active = true
        AND u.is_deleted = false
        AND u.moderation_hidden_at IS NULL
        AND u.moderation_restricted_at IS NULL
        AND u.id <> ${viewerId}
        AND left(lower(u.handle), ${anonPrefix.length}::int) <> ${anonPrefix}
        AND lower(u.handle) <> ${reserved}
        AND NOT EXISTS (
          SELECT 1 FROM app.app_user_blocks b WHERE b.blocker_id = u.id AND b.blocked_id = ${viewerId}
        )
        AND NOT EXISTS (
          SELECT 1 FROM app.app_user_blocks b WHERE b.blocker_id = ${viewerId} AND b.blocked_id = u.id
        )
    ) ranked
    ${cursorClause}
    ORDER BY ranked.tier ASC, ranked.last_seen_at DESC, ranked.id DESC
    LIMIT ${take}
  `;
}

/** "New" (joined in the last 7 days) wins over "recently active" (seen in the last 24 hours). */
export function resolveDiscoveryBadge(
  user: { createdAt: Date; lastSeenAt: Date },
  now: Date = new Date(),
): "new" | "active" | null {
  const nowMs = now.getTime();
  if (nowMs - user.createdAt.getTime() < NEW_USER_WINDOW_MS) return "new";
  if (nowMs - user.lastSeenAt.getTime() < RECENTLY_ACTIVE_WINDOW_MS) return "active";
  return null;
}

import { Prisma } from "@prisma/client";
import { ANONYMOUS_HANDLE_PREFIX, RESERVED_SEARCH_HANDLE } from "@/lib/handles";

/**
 * People discovery for the home (홈) tab: a grid of other users. People who
 * are online now come first, then Korean speakers for a foreigner and
 * foreigners for a Korean, newest activity first inside each group.
 *
 * Ranked in SQL over the whole candidate set. `tier` packs the ordering keys
 * before `lastSeenAt`:
 *   0 = other side + photo, 1 = other side, no photo,
 *   2 = same side + photo,  3 = same side, no photo,
 * plus 4 for anyone not online (seen more than ONLINE_WINDOW_MS ago), so
 * tiers 0-3 are the people online now and 4-7 everyone else.
 * Pagination is keyset on (tier asc, lastSeenAt desc, id desc). Someone can go
 * offline between two pages and show up again; the client drops repeats.
 *
 * Excluded: the viewer, inactive / deleted users, admin-hidden or restricted
 * users (moderationHiddenAt / moderationRestrictedAt), `anon_` handles, the
 * reserved handle, and a block in either direction.
 */

export const NEW_USER_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const RECENTLY_ACTIVE_WINDOW_MS = 24 * 60 * 60 * 1000;
/** "Online": seen within the last five minutes (lastSeenAt moves with every tracked request). */
export const ONLINE_WINDOW_MS = 5 * 60 * 1000;
export const MAX_DISCOVERY_TIER = 7;
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
      || parsed.tier > MAX_DISCOVERY_TIER
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

/** The explore tab's filters (owner, 2026-11-25). Absent = everyone. */
export type PeopleDiscoveryFilters = {
  gender?: "female" | "male" | null;
  /** Ages from the birth date, inclusive. */
  ageMin?: number | null;
  ageMax?: number | null;
  onlineOnly?: boolean;
  /** Someone who has this among their own languages (편한 언어). */
  primaryLanguage?: string | null;
  /** Someone who has this among their 관심 언어. */
  interestLanguage?: string | null;
};

export const DISCOVERY_AGE_MIN = 18;
export const DISCOVERY_AGE_MAX = 60;

/** Reads the filters from the query; anything unknown is left out. */
export function parsePeopleDiscoveryFilters(params: URLSearchParams): PeopleDiscoveryFilters {
  const gender = params.get("gender");
  const age = (key: string) => {
    const value = Number.parseInt(params.get(key) ?? "", 10);
    return Number.isFinite(value) && value >= DISCOVERY_AGE_MIN && value <= DISCOVERY_AGE_MAX ? value : null;
  };
  let ageMin = age("ageMin");
  let ageMax = age("ageMax");
  if (ageMin !== null && ageMax !== null && ageMin > ageMax) [ageMin, ageMax] = [ageMax, ageMin];
  return {
    gender: gender === "female" || gender === "male" ? gender : null,
    // The ends of the range mean "no limit" on that side.
    ageMin: ageMin !== null && ageMin > DISCOVERY_AGE_MIN ? ageMin : null,
    ageMax: ageMax !== null && ageMax < DISCOVERY_AGE_MAX ? ageMax : null,
    onlineOnly: params.get("online") === "1",
    primaryLanguage: readLanguageFilter(params.get("primaryLanguage")),
    interestLanguage: readLanguageFilter(params.get("interestLanguage")),
  };
}

/** A language code as profiles store it ("ko", "zh-CN"), lower-cased for the comparison; null when it is not one. */
function readLanguageFilter(value: string | null): string | null {
  const code = (value ?? "").trim();
  return /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/.test(code) ? code.toLowerCase() : null;
}

export type PeopleDiscoverySqlInput = {
  filters?: PeopleDiscoveryFilters;
  viewerId: string;
  /** Which side the viewer is on; the other side is ranked first. */
  viewerIsKorean: boolean;
  cursor: PeopleDiscoveryCursor | null;
  /** Rows to fetch (page size + 1 to detect another page). */
  take: number;
  /** The moment "online" is measured from; defaults to now. */
  now?: Date;
};

export function buildPeopleDiscoverySql({
  viewerId,
  viewerIsKorean,
  cursor,
  take,
  now = new Date(),
  filters = {},
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
  const onlineSince = new Date(now.getTime() - ONLINE_WINDOW_MS).toISOString();
  const onlineRank = Prisma.sql`CASE WHEN u.last_seen_at >= (${onlineSince}::timestamptz AT TIME ZONE 'UTC') THEN 0 ELSE 4 END`;

  // Born between these dates = the age range (today in UTC).
  const yearsAgo = (years: number) => {
    const date = new Date(now);
    date.setUTCFullYear(date.getUTCFullYear() - years);
    return date.toISOString().slice(0, 10);
  };
  const filterClause = Prisma.sql`
        ${filters.gender ? Prisma.sql`AND u.gender = ${filters.gender}` : Prisma.empty}
        ${filters.ageMin ? Prisma.sql`AND u.birth_date <= ${yearsAgo(filters.ageMin)}::date` : Prisma.empty}
        ${filters.ageMax ? Prisma.sql`AND u.birth_date > ${yearsAgo(filters.ageMax + 1)}::date` : Prisma.empty}
        ${filters.onlineOnly ? Prisma.sql`AND u.last_seen_at >= (${onlineSince}::timestamptz AT TIME ZONE 'UTC')` : Prisma.empty}
        ${filters.primaryLanguage ? Prisma.sql`AND EXISTS (SELECT 1 FROM unnest(u.primary_languages) AS own(code) WHERE lower(own.code) = ${filters.primaryLanguage})` : Prisma.empty}
        ${filters.interestLanguage ? Prisma.sql`AND EXISTS (SELECT 1 FROM unnest(u.interest_languages) AS wanted(code) WHERE lower(wanted.code) = ${filters.interestLanguage})` : Prisma.empty}`;

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
        (${onlineRank} + ${sideRank} + ${photoRank})::int AS tier
      FROM app.app_users u
      WHERE u.is_active = true
        AND u.is_deleted = false
        AND u.moderation_hidden_at IS NULL
        AND u.moderation_restricted_at IS NULL
        AND u.dormant_at IS NULL
        AND u.id <> ${viewerId}
        AND left(lower(u.handle), ${anonPrefix.length}::int) <> ${anonPrefix}
        AND lower(u.handle) <> ${reserved}
        ${filterClause}
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

/** "Online" (seen in the last 5 minutes) wins over "new" (joined in the last 7 days), which wins over "recently active" (seen in the last 24 hours). */
export function resolveDiscoveryBadge(
  user: { createdAt: Date; lastSeenAt: Date },
  now: Date = new Date(),
): "online" | "new" | "active" | null {
  const nowMs = now.getTime();
  if (nowMs - user.lastSeenAt.getTime() < ONLINE_WINDOW_MS) return "online";
  if (nowMs - user.createdAt.getTime() < NEW_USER_WINDOW_MS) return "new";
  if (nowMs - user.lastSeenAt.getTime() < RECENTLY_ACTIVE_WINDOW_MS) return "active";
  return null;
}

/** One line of a bio for a card: whitespace collapsed, cut to `max` characters. */
export function bioCardLine(bio: string | null | undefined, max = 80): string | null {
  const line = (bio ?? "").replace(/\s+/g, " ").trim();
  if (!line) return null;
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

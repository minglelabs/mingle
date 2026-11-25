/**
 * What kind of post it is (owner, 2026-11-25), picked on the write screen:
 *
 * - `free`: an ordinary post (every post before this was one).
 * - `hour`: gone from every list an hour after it was published.
 * - `intro`: a self-introduction. The author's country, age and height come
 *   from the profile; at least one hobby and some text are required.
 *
 * Client-safe: the write screen, the card and the server all read this.
 */
export const POST_CATEGORIES = ["free", "hour", "intro"] as const;
export type PostCategory = (typeof POST_CATEGORIES)[number];

export const POST_HOUR_MS = 60 * 60 * 1000;

export const POST_HOBBIES = [
  "travel", "music", "anime", "drama", "games", "sports",
  "cooking", "cafes", "photo", "reading", "fashion", "languages",
] as const;
export type PostHobby = (typeof POST_HOBBIES)[number];

export const POST_INTRO_HOBBIES_MAX = 5;
/** A self-introduction says something: this many characters at least. */
export const POST_INTRO_TEXT_MIN = 10;

export type PostIntro = {
  /** ISO 3166-1 alpha-2, from the profile. */
  country: string | null;
  age: number | null;
  heightCm: number | null;
  hobbies: PostHobby[];
};

export function parsePostCategory(value: unknown): PostCategory {
  return (POST_CATEGORIES as readonly unknown[]).includes(value) ? (value as PostCategory) : "free";
}

/** The picked hobbies: known ones only, no repeats, at most five. */
export function sanitizePostHobbies(value: unknown): PostHobby[] {
  if (!Array.isArray(value)) return [];
  const out: PostHobby[] = [];
  for (const entry of value) {
    if (!(POST_HOBBIES as readonly unknown[]).includes(entry) || out.includes(entry as PostHobby)) continue;
    out.push(entry as PostHobby);
    if (out.length >= POST_INTRO_HOBBIES_MAX) break;
  }
  return out;
}

/** Why a self-introduction cannot be posted yet, or null when it can. */
export function postIntroProblem(input: { text: string | null; hobbies: readonly string[] }): "hobbies" | "text" | null {
  if (input.hobbies.length === 0) return "hobbies";
  return [...(input.text ?? "").trim()].length < POST_INTRO_TEXT_MIN ? "text" : null;
}

/** A stored `intro` column, read defensively (it is JSON). */
export function readPostIntro(value: unknown): PostIntro | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const number = (entry: unknown) => (typeof entry === "number" && Number.isFinite(entry) && entry > 0 ? Math.round(entry) : null);
  return {
    country: typeof row.country === "string" && /^[A-Za-z]{2}$/.test(row.country) ? row.country.toUpperCase() : null,
    age: number(row.age),
    heightCm: number(row.heightCm),
    hobbies: sanitizePostHobbies(row.hobbies),
  };
}

/** Whole minutes an hour post still has (at least 1 while it is up), or null when it has no end. */
export function postMinutesLeft(expiresAt: string | null | undefined, now: number): number | null {
  if (!expiresAt) return null;
  const end = Date.parse(expiresAt);
  if (!Number.isFinite(end)) return null;
  return Math.max(1, Math.ceil((end - now) / 60_000));
}

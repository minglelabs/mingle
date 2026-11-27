/**
 * What kind of post it is (owner, 2026-11-25), picked on the write screen:
 *
 * - `free`: an ordinary post (every post before this was one).
 * - `hour`: gone from every list an hour after it was published.
 * - `intro`: a self-introduction. The author's country, age and height come
 *   from the profile; at least one hobby and some text are required.
 * - `call`: takes 1:1 voice talks for an hour (then it is gone, as an hour
 *   post is). Its card has a call button; see src/server/post-calls.ts.
 *
 * Client-safe: the write screen, the card and the server all read this.
 */
export const POST_CATEGORIES = ["free", "hour", "intro", "call"] as const;
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

/**
 * More of a self-introduction (owner, 2026-11-26), all optional and all
 * picked from lists, so every viewer reads them in their own language: job,
 * personality, favourite food and animal, drinking, and what they are into
 * these days.
 */
export const POST_INTRO_JOBS = ["student", "office", "freelance", "business", "professional", "public", "creator", "service", "job_seeking", "other"] as const;
export const POST_INTRO_PERSONALITIES = ["outgoing", "introvert", "warm", "funny", "calm", "lively", "honest", "planner", "spontaneous"] as const;
export const POST_INTRO_FOODS = ["korean", "japanese", "chinese", "western", "street", "dessert", "spicy", "meat", "seafood", "vegetarian"] as const;
export const POST_INTRO_ANIMALS = ["dog", "cat", "rabbit", "hamster", "bird", "fish", "reptile"] as const;
export const POST_INTRO_DRINKS = ["never", "sometimes", "often", "social"] as const;
export const POST_INTRO_INTERESTS = ["fitness", "money", "self_growth", "dating", "trip_plans", "korean", "food_hunt", "new_hobby", "career", "kpop"] as const;
/** At most this many of each list where several can be picked (job and drinking: one). */
export const POST_INTRO_MULTI_MAX = 3;

export type PostIntroJob = (typeof POST_INTRO_JOBS)[number];
export type PostIntroPersonality = (typeof POST_INTRO_PERSONALITIES)[number];
export type PostIntroFood = (typeof POST_INTRO_FOODS)[number];
export type PostIntroAnimal = (typeof POST_INTRO_ANIMALS)[number];
export type PostIntroDrink = (typeof POST_INTRO_DRINKS)[number];
export type PostIntroInterest = (typeof POST_INTRO_INTERESTS)[number];

export type PostIntroExtras = {
  job: PostIntroJob | null;
  personality: PostIntroPersonality[];
  foods: PostIntroFood[];
  animals: PostIntroAnimal[];
  drink: PostIntroDrink | null;
  interests: PostIntroInterest[];
};

export const EMPTY_POST_INTRO_EXTRAS: PostIntroExtras = { job: null, personality: [], foods: [], animals: [], drink: null, interests: [] };

function pickOne<T extends string>(list: readonly T[], value: unknown): T | null {
  return (list as readonly unknown[]).includes(value) ? (value as T) : null;
}

function pickSome<T extends string>(list: readonly T[], value: unknown): T[] {
  if (!Array.isArray(value)) return [];
  const out: T[] = [];
  for (const entry of value) {
    if (!(list as readonly unknown[]).includes(entry) || out.includes(entry as T)) continue;
    out.push(entry as T);
    if (out.length >= POST_INTRO_MULTI_MAX) break;
  }
  return out;
}

/** What a client sent (or a stored row holds): known keys only, at most three of each list. */
export function sanitizePostIntroExtras(value: unknown): PostIntroExtras {
  const row = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  return {
    job: pickOne(POST_INTRO_JOBS, row.job),
    personality: pickSome(POST_INTRO_PERSONALITIES, row.personality),
    foods: pickSome(POST_INTRO_FOODS, row.foods),
    animals: pickSome(POST_INTRO_ANIMALS, row.animals),
    drink: pickOne(POST_INTRO_DRINKS, row.drink),
    interests: pickSome(POST_INTRO_INTERESTS, row.interests),
  };
}

export type PostIntro = PostIntroExtras & {
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
/** A voice talk post's own title ("방제", owner 2026-11-27); none: the viewer's default invitation. */
export const POST_CALL_TITLE_MAX = 40;

export function sanitizePostCallTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const title = value.replace(/\s+/g, " ").trim().slice(0, POST_CALL_TITLE_MAX).trim();
  return title || null;
}

/** The title kept with a voice talk post (in its `intro` column, which a call post has no other use for). */
export function readPostCallTitle(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return sanitizePostCallTitle((value as Record<string, unknown>).callTitle);
}

export function readPostIntro(value: unknown): PostIntro | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const number = (entry: unknown) => (typeof entry === "number" && Number.isFinite(entry) && entry > 0 ? Math.round(entry) : null);
  return {
    country: typeof row.country === "string" && /^[A-Za-z]{2}$/.test(row.country) ? row.country.toUpperCase() : null,
    age: number(row.age),
    heightCm: number(row.heightCm),
    hobbies: sanitizePostHobbies(row.hobbies),
    ...sanitizePostIntroExtras(row),
  };
}

/** Whole minutes an hour post still has (at least 1 while it is up), or null when it has no end. */
export function postMinutesLeft(expiresAt: string | null | undefined, now: number): number | null {
  if (!expiresAt) return null;
  const end = Date.parse(expiresAt);
  if (!Number.isFinite(end)) return null;
  return Math.max(1, Math.ceil((end - now) / 60_000));
}

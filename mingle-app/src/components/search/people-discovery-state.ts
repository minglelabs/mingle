import { clampLanguageLevel, type InterestLanguage } from "@/lib/interest-languages";
import type { SttLanguageCode } from "@/lib/stt-languages";

/** One card from `GET /api/users/discover`. */
export type DiscoveryPerson = {
  id: string;
  handle: string | null;
  name: string | null;
  image: string | null;
  imageCropScale?: number | null;
  imageCropX?: number | null;
  imageCropY?: number | null;
  age?: number;
  nationalityCountry: string | null;
  primaryLanguages: string[];
  interestLanguages: InterestLanguage[];
  badge?: "new" | "active";
  isOfficial?: boolean;
};

export type DiscoveryPage = {
  users: DiscoveryPerson[];
  nextCursor: string | null;
  viewerSide: "korean" | "foreign";
};

const optionalNumber = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
const optionalString = (value: unknown) => (typeof value === "string" && value.trim() ? value : null);

function parsePerson(value: unknown): DiscoveryPerson | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.id !== "string" || !raw.id) return null;
  const interest = Array.isArray(raw.interestLanguages) ? raw.interestLanguages : [];
  return {
    id: raw.id,
    handle: optionalString(raw.handle),
    name: optionalString(raw.name),
    image: optionalString(raw.image),
    imageCropScale: optionalNumber(raw.imageCropScale),
    imageCropX: optionalNumber(raw.imageCropX),
    imageCropY: optionalNumber(raw.imageCropY),
    ...(typeof raw.age === "number" && Number.isSafeInteger(raw.age) && raw.age >= 0 ? { age: raw.age } : {}),
    nationalityCountry: optionalString(raw.nationalityCountry),
    primaryLanguages: Array.isArray(raw.primaryLanguages)
      ? raw.primaryLanguages.filter((code): code is string => typeof code === "string" && Boolean(code))
      : [],
    interestLanguages: interest.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const { code, level } = entry as { code?: unknown; level?: unknown };
      return typeof code === "string" && code ? [{ code: code as SttLanguageCode, level: clampLanguageLevel(level) }] : [];
    }),
    ...(raw.badge === "new" || raw.badge === "active" ? { badge: raw.badge } : {}),
    ...(raw.isOfficial === true ? { isOfficial: true } : {}),
  };
}

/** Tolerant reader for the wire payload; drops malformed rows. */
export function parseDiscoveryPage(payload: unknown): DiscoveryPage {
  const raw = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  return {
    users: Array.isArray(raw.users) ? raw.users.map(parsePerson).filter((p): p is DiscoveryPerson => p !== null) : [],
    nextCursor: optionalString(raw.nextCursor),
    viewerSide: raw.viewerSide === "korean" ? "korean" : "foreign",
  };
}

/** Append the next page, skipping anyone already on screen (a user can move tiers between pages). */
export function mergeDiscoveryPage(current: DiscoveryPage, next: DiscoveryPage): DiscoveryPage {
  const seen = new Set(current.users.map((user) => user.id));
  return {
    users: [...current.users, ...next.users.filter((user) => !seen.has(user.id))],
    nextCursor: next.nextCursor,
    viewerSide: current.viewerSide,
  };
}

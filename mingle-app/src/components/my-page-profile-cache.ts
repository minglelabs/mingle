"use client";

import type { BirthDateParts } from "@/lib/birth-date";
import type { ProfileLocationRecord } from "@/lib/profile-location";

const MY_PAGE_PROFILE_CACHE_KEY_PREFIX = "mingle:my-page-profile-cache:v1";
const MY_PAGE_PROFILE_CACHE_MAX_STALE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type MyPageProfileRecord = {
  bioDraft?: string | null;
  image: string | null;
  imageCropScale: number | null;
  imageCropX: number | null;
  imageCropY: number | null;
  handle: string | null;
  name: string | null;
  bio: string | null;
  nationality: string | null;
  primaryLanguages: string[];
  defaultConversationLanguages: string[];
  location: ProfileLocationRecord | null;
  birthDate?: BirthDateParts | null;
  followersCount: number;
  followingCount: number;
};

// Only what the profile header shows is written to disk. Location, birth date
// and the unpublished bio draft stay in memory and are restored by the API
// refresh that follows every mount.
type PersistedMyPageProfile = Omit<MyPageProfileRecord, "bioDraft" | "birthDate" | "location">;

type PersistedMyPageProfileRecord = {
  savedAt: number;
  profile: PersistedMyPageProfile;
};

// Survives tab switches inside one WebView session, so MyPage can render the
// last known profile on its first frame without a server-provided snapshot.
const myPageProfileMemoryCache = new Map<string, MyPageProfileRecord>();

export function createEmptyMyPageProfile(): MyPageProfileRecord {
  return {
    image: null,
    imageCropScale: null,
    imageCropX: null,
    imageCropY: null,
    handle: null,
    name: null,
    bio: null,
    nationality: null,
    primaryLanguages: [],
    defaultConversationLanguages: [],
    location: null,
    birthDate: null,
    followersCount: 0,
    followingCount: 0,
  };
}

function buildMyPageProfileCacheKey(userId: string): string {
  return `${MY_PAGE_PROFILE_CACHE_KEY_PREFIX}:${encodeURIComponent(userId)}`;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function normalizePersistedRecord(value: unknown, now = Date.now()): MyPageProfileRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const record = value as Partial<PersistedMyPageProfileRecord>;
  if (
    typeof record.savedAt !== "number"
    || !Number.isFinite(record.savedAt)
    || record.savedAt > now + 60_000
    || now - record.savedAt > MY_PAGE_PROFILE_CACHE_MAX_STALE_AGE_MS
    || !record.profile
    || typeof record.profile !== "object"
    || Array.isArray(record.profile)
  ) {
    return null;
  }

  const profile = record.profile as Partial<PersistedMyPageProfile>;
  if (
    !isNullableString(profile.image)
    || !isNullableFiniteNumber(profile.imageCropScale)
    || !isNullableFiniteNumber(profile.imageCropX)
    || !isNullableFiniteNumber(profile.imageCropY)
    || !isNullableString(profile.handle)
    || !isNullableString(profile.name)
    || !isNullableString(profile.bio)
    || !isNullableString(profile.nationality)
    || !isStringArray(profile.primaryLanguages)
    || !isStringArray(profile.defaultConversationLanguages)
    || !isCount(profile.followersCount)
    || !isCount(profile.followingCount)
  ) {
    return null;
  }

  return {
    ...createEmptyMyPageProfile(),
    image: profile.image,
    imageCropScale: profile.imageCropScale,
    imageCropX: profile.imageCropX,
    imageCropY: profile.imageCropY,
    handle: profile.handle,
    name: profile.name,
    bio: profile.bio,
    nationality: profile.nationality,
    primaryLanguages: profile.primaryLanguages,
    defaultConversationLanguages: profile.defaultConversationLanguages,
    followersCount: profile.followersCount,
    followingCount: profile.followingCount,
  };
}

export function readMyPageProfileMemoryCache(userId: string): MyPageProfileRecord | null {
  if (!userId) return null;
  return myPageProfileMemoryCache.get(userId) ?? null;
}

export function readMyPageProfileCache(userId: string): MyPageProfileRecord | null {
  if (typeof window === "undefined" || !userId) return null;

  const memoryCached = readMyPageProfileMemoryCache(userId);
  if (memoryCached) return memoryCached;

  const storageKey = buildMyPageProfileCacheKey(userId);
  try {
    const rawValue = window.localStorage.getItem(storageKey);
    if (!rawValue) return null;

    const cached = normalizePersistedRecord(JSON.parse(rawValue));
    if (!cached) {
      window.localStorage.removeItem(storageKey);
      return null;
    }

    myPageProfileMemoryCache.set(userId, cached);
    return cached;
  } catch {
    return null;
  }
}

export function writeMyPageProfileCache(userId: string, profile: MyPageProfileRecord): void {
  if (typeof window === "undefined" || !userId) return;

  myPageProfileMemoryCache.set(userId, profile);

  const persisted: PersistedMyPageProfileRecord = {
    savedAt: Date.now(),
    profile: {
      image: profile.image,
      imageCropScale: profile.imageCropScale,
      imageCropX: profile.imageCropX,
      imageCropY: profile.imageCropY,
      handle: profile.handle,
      name: profile.name,
      bio: profile.bio,
      nationality: profile.nationality,
      primaryLanguages: profile.primaryLanguages,
      defaultConversationLanguages: profile.defaultConversationLanguages,
      followersCount: profile.followersCount,
      followingCount: profile.followingCount,
    },
  };
  try {
    window.localStorage.setItem(buildMyPageProfileCacheKey(userId), JSON.stringify(persisted));
  } catch {
    // The memory cache still covers this session when storage is unavailable or full.
  }
}

export function clearMyPageProfileCache(): void {
  myPageProfileMemoryCache.clear();
  if (typeof window === "undefined") return;

  try {
    const storage = window.localStorage;
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index);
      if (key?.startsWith(`${MY_PAGE_PROFILE_CACHE_KEY_PREFIX}:`)) storage.removeItem(key);
    }
  } catch {
    // Nothing persisted can be removed when storage is unavailable.
  }
}

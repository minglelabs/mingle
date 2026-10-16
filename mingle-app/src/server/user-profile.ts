import { getPublishedBioText } from "./profile-bio";
import { prisma } from "@/lib/prisma";
import { sanitizeSttLanguageSelection } from "@/lib/stt-languages";
import { identityBadgeFlags } from "@/server/identity/user-identity-select";

export type UserProfileLocation = {
  latitude: number;
  longitude: number;
  city: string | null;
  country: string | null;
  countryCode: string | null;
};

export const userProfileSelect = {
  id: true,
  name: true,
  image: true,
  imageObjectKey: true,
  imageCropScale: true,
  imageCropX: true,
  imageCropY: true,
  handle: true,
  bio: true,
  birthDate: true,
  nationality: true,
  primaryLanguages: true,
  defaultConversationLanguages: true,
  locationLatitude: true,
  locationLongitude: true,
  locationCity: true,
  locationCountry: true,
  locationCountryCode: true,
  // Badge flags: `/p/{userId}` (and a shared room's inviter) shows this
  // profile to other people, so an operator account must stay labeled.
  isOfficial: true,
  isOperator: true,
  _count: {
    select: {
      followerRelations: {
        where: { follower: { isActive: true } },
      },
      followingRelations: {
        where: { following: { isActive: true } },
      },
    },
  },
} as const;

type SelectedUserProfile = {
  id: string;
  name: string | null;
  image: string | null;
  imageObjectKey: string | null;
  imageCropScale: number | null;
  imageCropX: number | null;
  imageCropY: number | null;
  handle: string | null;
  bio: string | null;
  birthDate?: Date | null;
  nationality: string | null;
  primaryLanguages: string[];
  defaultConversationLanguages: string[];
  locationLatitude: number | null;
  locationLongitude: number | null;
  locationCity: string | null;
  locationCountry: string | null;
  locationCountryCode: string | null;
  /** Optional so hand-built rows (tests, older selects) still type-check. */
  isOfficial?: boolean | null;
  isOperator?: boolean | null;
  _count: {
    followerRelations: number;
    followingRelations: number;
  };
};

export type UserProfile = {
  bioDraft?: string | null;
  id: string;
  name: string | null;
  image: string | null;
  imageCropScale: number | null;
  imageCropX: number | null;
  imageCropY: number | null;
  handle: string | null;
  bio: string | null;
  /** Current age in whole years; the original birth date is never serialized. */
  age?: number;
  nationality: string | null;
  primaryLanguages: string[];
  defaultConversationLanguages: string[];
  location: UserProfileLocation | null;
  followersCount: number;
  followingCount: number;
  /** The Mingle team's official account; present (true) only then. */
  isOfficial?: boolean;
};

export function calculateProfileAge(
  birthDate: Date | null | undefined,
  now: Date = new Date(),
): number | undefined {
  if (
    !(birthDate instanceof Date)
    || !Number.isFinite(birthDate.getTime())
    || !(now instanceof Date)
    || !Number.isFinite(now.getTime())
  ) {
    return undefined;
  }

  const birthYear = birthDate.getUTCFullYear();
  const birthMonth = birthDate.getUTCMonth();
  const birthDay = birthDate.getUTCDate();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth();
  const currentDay = now.getUTCDate();
  const birthDateIsFuture = birthYear > currentYear
    || (birthYear === currentYear && birthMonth > currentMonth)
    || (birthYear === currentYear && birthMonth === currentMonth && birthDay > currentDay);

  if (birthDateIsFuture) return undefined;

  const birthdayHasPassed = currentMonth > birthMonth
    || (currentMonth === birthMonth && currentDay >= birthDay);
  return currentYear - birthYear - (birthdayHasPassed ? 0 : 1);
}

export function serializeUserProfile(profile: SelectedUserProfile, now: Date = new Date()): UserProfile {
  const {
    _count,
    id,
    name,
    image,
    imageCropScale,
    imageCropX,
    imageCropY,
    handle,
    bio,
    birthDate,
    nationality,
    primaryLanguages,
    defaultConversationLanguages,
    locationLatitude,
    locationLongitude,
    locationCity,
    locationCountry,
    locationCountryCode,
    isOfficial,
    isOperator,
  } = profile;
  const location = typeof locationLatitude === "number"
    && Number.isFinite(locationLatitude)
    && typeof locationLongitude === "number"
    && Number.isFinite(locationLongitude)
    ? {
        latitude: locationLatitude,
        longitude: locationLongitude,
        city: locationCity,
        country: locationCountry,
        countryCode: locationCountryCode,
      }
    : null;
  const normalizedNationality = nationality
    ? sanitizeSttLanguageSelection([nationality])[0] ?? null
    : null;
  const normalizedPrimaryLanguages = sanitizeSttLanguageSelection(
    primaryLanguages,
    normalizedNationality ? [normalizedNationality] : [],
  );
  const age = calculateProfileAge(birthDate, now);
  return {
    id,
    name,
    image,
    imageCropScale,
    imageCropX,
    imageCropY,
    handle,
    bio,
    ...(age !== undefined ? { age } : {}),
    nationality: normalizedPrimaryLanguages[0] ?? normalizedNationality,
    primaryLanguages: normalizedPrimaryLanguages,
    defaultConversationLanguages: sanitizeSttLanguageSelection(defaultConversationLanguages),
    location,
    followersCount: _count.followerRelations,
    followingCount: _count.followingRelations,
    ...identityBadgeFlags({ isOfficial }),
  };
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) return null;

  const profile = await prisma.user.findUnique({
    where: { id: normalizedUserId },
    select: userProfileSelect,
  });

  return profile ? { ...serializeUserProfile(profile), bio: await getPublishedBioText(userId, profile.bio), bioDraft: profile.bio } : null;
}

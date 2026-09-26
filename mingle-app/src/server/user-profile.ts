import { getPublishedBioText } from "./profile-bio";
import { prisma } from "@/lib/prisma";
import { sanitizeSttLanguageSelection } from "@/lib/stt-languages";

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
  nationality: true,
  primaryLanguages: true,
  defaultConversationLanguages: true,
  locationLatitude: true,
  locationLongitude: true,
  locationCity: true,
  locationCountry: true,
  locationCountryCode: true,
  isOfficial: true,
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
  nationality: string | null;
  primaryLanguages: string[];
  defaultConversationLanguages: string[];
  location: UserProfileLocation | null;
  followersCount: number;
  followingCount: number;
  /** Operator / official account; present (true) only for official accounts. */
  isOfficial?: boolean;
};

export function serializeUserProfile(profile: SelectedUserProfile): UserProfile {
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
    nationality,
    primaryLanguages,
    defaultConversationLanguages,
    locationLatitude,
    locationLongitude,
    locationCity,
    locationCountry,
    locationCountryCode,
    isOfficial,
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
  return {
    id,
    name,
    image,
    imageCropScale,
    imageCropX,
    imageCropY,
    handle,
    bio,
    nationality: normalizedPrimaryLanguages[0] ?? normalizedNationality,
    primaryLanguages: normalizedPrimaryLanguages,
    defaultConversationLanguages: sanitizeSttLanguageSelection(defaultConversationLanguages),
    location,
    followersCount: _count.followerRelations,
    followingCount: _count.followingRelations,
    ...(isOfficial === true ? { isOfficial: true } : {}),
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

import { prisma } from "@/lib/prisma";
import { sanitizeSttLanguageSelection } from "@/lib/stt-languages";

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
  _count: {
    followerRelations: number;
    followingRelations: number;
  };
};

export type UserProfile = {
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
  followersCount: number;
  followingCount: number;
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
  } = profile;
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
    followersCount: _count.followerRelations,
    followingCount: _count.followingRelations,
  };
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) return null;

  const profile = await prisma.user.findUnique({
    where: { id: normalizedUserId, isActive: true },
    select: userProfileSelect,
  });

  return profile ? serializeUserProfile(profile) : null;
}

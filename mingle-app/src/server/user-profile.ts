import { prisma } from "@/lib/prisma";

export const userProfileSelect = {
  id: true,
  name: true,
  image: true,
  handle: true,
  bio: true,
  nationality: true,
  _count: {
    select: {
      followerRelations: true,
      followingRelations: true,
    },
  },
} as const;

type SelectedUserProfile = {
  id: string;
  name: string | null;
  image: string | null;
  handle: string | null;
  bio: string | null;
  nationality: string | null;
  _count: {
    followerRelations: number;
    followingRelations: number;
  };
};

export type UserProfile = {
  id: string;
  name: string | null;
  image: string | null;
  handle: string | null;
  bio: string | null;
  nationality: string | null;
  followersCount: number;
  followingCount: number;
};

export function serializeUserProfile(profile: SelectedUserProfile): UserProfile {
  const { _count, ...profileFields } = profile;
  return {
    ...profileFields,
    followersCount: _count.followerRelations,
    followingCount: _count.followingRelations,
  };
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) return null;

  const profile = await prisma.user.findUnique({
    where: { id: normalizedUserId },
    select: userProfileSelect,
  });

  return profile ? serializeUserProfile(profile) : null;
}

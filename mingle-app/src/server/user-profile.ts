import { prisma } from "@/lib/prisma";

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
  imageObjectKey: string | null;
  imageCropScale: number | null;
  imageCropX: number | null;
  imageCropY: number | null;
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
  imageCropScale: number | null;
  imageCropX: number | null;
  imageCropY: number | null;
  handle: string | null;
  bio: string | null;
  nationality: string | null;
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
  } = profile;
  return {
    id,
    name,
    image,
    imageCropScale,
    imageCropX,
    imageCropY,
    handle,
    bio,
    nationality,
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

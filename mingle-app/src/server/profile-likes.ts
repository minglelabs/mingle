import { prisma } from "@/lib/prisma";
import { accountShownInAppWhere } from "@/server/posts/block-visibility";

/**
 * Hearts on a profile (owner, 2026-11-25), as on a dating app: a heart button
 * on someone's profile, and on My page how many hearts the account got and
 * from whom. One heart per pair; taking it back removes it. Nobody hearts
 * their own profile.
 */
export const PROFILE_LIKES_LIST_LIMIT = 100;

export type ProfileLiker = { id: string; name: string | null; handle: string | null; image: string | null; likedAt: string };

/** An account that can be hearted: there, active, shown in the app. */
async function findLikeTarget(userId: string): Promise<boolean> {
  const user = await prisma.user.findFirst({
    where: { id: userId, isActive: true, isDeleted: false, ...accountShownInAppWhere() },
    select: { id: true },
  });
  return user !== null;
}

export async function hasLikedProfile(likerId: string, likedId: string): Promise<boolean> {
  if (!likerId || !likedId) return false;
  const row = await prisma.profileLike.findUnique({ where: { likerId_likedId: { likerId, likedId } }, select: { likerId: true } });
  return row !== null;
}

export type ProfileLikeResult = { ok: true; liked: boolean } | { ok: false; error: "self" | "not_found" | "blocked" };

export async function setProfileLike(likerId: string, likedId: string, liked: boolean): Promise<ProfileLikeResult> {
  if (likerId === likedId) return { ok: false, error: "self" };
  if (!liked) {
    await prisma.profileLike.deleteMany({ where: { likerId, likedId } });
    return { ok: true, liked: false };
  }
  if (!(await findLikeTarget(likedId))) return { ok: false, error: "not_found" };
  // A block either way: no heart.
  const block = await prisma.userBlock.findFirst({
    where: { OR: [{ blockerId: likerId, blockedId: likedId }, { blockerId: likedId, blockedId: likerId }] },
    select: { id: true },
  });
  if (block) return { ok: false, error: "blocked" };
  await prisma.profileLike.upsert({
    where: { likerId_likedId: { likerId, likedId } },
    create: { likerId, likedId },
    update: {},
  });
  return { ok: true, liked: true };
}

/** The hearts an account got: how many, and who sent them, newest first. People it blocked (or who blocked it) and hidden accounts are left out. */
export async function listProfileLikers(userId: string): Promise<{ count: number; people: ProfileLiker[] }> {
  const rows = await prisma.profileLike.findMany({
    where: {
      likedId: userId,
      liker: {
        isActive: true,
        isDeleted: false,
        ...accountShownInAppWhere(),
        blockedByRelations: { none: { blockerId: userId } },
        blockingRelations: { none: { blockedId: userId } },
      },
    },
    orderBy: { createdAt: "desc" },
    take: PROFILE_LIKES_LIST_LIMIT,
    select: { createdAt: true, liker: { select: { id: true, name: true, handle: true, image: true } } },
  });
  return {
    count: rows.length,
    people: rows.map((row) => ({ id: row.liker.id, name: row.liker.name, handle: row.liker.handle, image: row.liker.image, likedAt: row.createdAt.toISOString() })),
  };
}

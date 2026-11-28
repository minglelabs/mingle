import { prisma } from "@/lib/prisma";
import { accountShownInAppWhere } from "@/server/posts/block-visibility";

/**
 * Hearts on a profile (owner, 2026-11-25), as on a dating app: a heart button
 * on someone's profile, and on My page how many hearts the account got and
 * from whom. One heart per pair; taking it back removes it. Nobody hearts
 * their own profile.
 */
/** One page of the likers list; the list itself has no end (owner, 2026-11-28: no 100 cap). */
export const PROFILE_LIKES_PAGE_SIZE = 100;

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

/**
 * The hearts an account got: how many in all, and who sent them, newest first,
 * a page at a time (`cursor`: the liker id the previous page ended on). People
 * it blocked (or who blocked it) and hidden accounts are left out.
 */
export async function listProfileLikers(
  userId: string,
  cursor?: string | null,
): Promise<{ count: number; people: ProfileLiker[]; nextCursor: string | null }> {
  const where = {
    likedId: userId,
    liker: {
      isActive: true,
      isDeleted: false,
      ...accountShownInAppWhere(),
      blockedByRelations: { none: { blockerId: userId } },
      blockingRelations: { none: { blockedId: userId } },
    },
  };
  const [count, rows] = await Promise.all([
    prisma.profileLike.count({ where }),
    prisma.profileLike.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { likerId: "desc" }],
      take: PROFILE_LIKES_PAGE_SIZE + 1,
      ...(cursor ? { cursor: { likerId_likedId: { likerId: cursor, likedId: userId } }, skip: 1 } : {}),
      select: { createdAt: true, liker: { select: { id: true, name: true, handle: true, image: true } } },
    }),
  ]);
  const page = rows.slice(0, PROFILE_LIKES_PAGE_SIZE);
  return {
    count,
    people: page.map((row) => ({ id: row.liker.id, name: row.liker.name, handle: row.liker.handle, image: row.liker.image, likedAt: row.createdAt.toISOString() })),
    nextCursor: rows.length > PROFILE_LIKES_PAGE_SIZE ? page[page.length - 1]?.liker.id ?? null : null,
  };
}

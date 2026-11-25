import { MICRO_PER_COIN } from "@/lib/coin-units";
import { calculateProfileAge } from "@/server/user-profile";
import { prisma } from "@/lib/prisma";
import { resolveUserCoinBillingMode } from "@/server/coins/config";
import { hasLedgerEntry, takeFromLots, withLockedWallet } from "@/server/coins/ledger";

/**
 * "Who viewed my profile" (owner, 2026-11-25), on My page for everyone.
 * Visits come from ProfileView (recorded when a profile opens). A locked
 * visitor shows only age, nationality, own languages and 관심 언어, over a
 * blurred shape: no photo, name, handle, id or profile is sent at all, until
 * the owner pays VISITOR_UNLOCK_COINS Hash for that person; then that person
 * stays visible. A visitor is addressed by the id of their latest visit row,
 * so the list never gives away who it is.
 */
export const VISITOR_UNLOCK_COINS = 10;

/** What a locked visitor shows (owner, 2026-11-25): enough to be curious, not enough to find them. */
export type ProfileVisitorHints = {
  age: number | null;
  nationalityCountry: string | null;
  primaryLanguages: string[];
  interestLanguages: string[];
};
const WINDOW_DAYS = 30;
const MAX_VISITORS = 50;

export type ProfileVisitorItem =
  | { token: string; unlocked: false; visitedAt: string; hints: ProfileVisitorHints }
  | {
      token: string;
      unlocked: true;
      visitedAt: string;
      user: { id: string; name: string | null; handle: string | null; image: string | null; imageCropScale: number | null; imageCropX: number | null; imageCropY: number | null };
    };

/** The latest visit of each person, newest first (pure, for tests). */
export function latestVisitPerVisitor<T extends { id: string; viewerId: string; createdAt: Date }>(rows: readonly T[], ownerId: string, limit = MAX_VISITORS): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const row of [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())) {
    if (row.viewerId === ownerId || seen.has(row.viewerId)) continue;
    seen.add(row.viewerId);
    result.push(row);
    if (result.length >= limit) break;
  }
  return result;
}

export async function listProfileVisitors(userId: string, now: Date = new Date()): Promise<ProfileVisitorItem[]> {
  const since = new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const rows = await prisma.profileView.findMany({
    where: { profileUserId: userId, createdAt: { gte: since }, viewerId: { not: userId } },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: { id: true, viewerId: true, createdAt: true },
  });
  const latest = latestVisitPerVisitor(rows, userId, MAX_VISITORS * 2);
  if (latest.length === 0) return [];
  const viewerIds = latest.map((row) => row.viewerId);
  const [viewers, blocks, unlocks] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: viewerIds }, isActive: true, isDeleted: false, isOfficial: false, moderationHiddenAt: null },
      select: {
        id: true, name: true, handle: true, image: true, imageCropScale: true, imageCropX: true, imageCropY: true,
        birthDate: true, nationalityCountry: true, primaryLanguages: true, interestLanguages: true,
      },
    }),
    prisma.userBlock.findMany({
      where: { OR: [{ blockerId: userId, blockedId: { in: viewerIds } }, { blockedId: userId, blockerId: { in: viewerIds } }] },
      select: { blockerId: true, blockedId: true },
    }),
    prisma.profileVisitorUnlock.findMany({ where: { userId, visitorId: { in: viewerIds } }, select: { visitorId: true } }),
  ]);
  const byId = new Map(viewers.map((viewer) => [viewer.id, viewer]));
  const blocked = new Set(blocks.map((block) => (block.blockerId === userId ? block.blockedId : block.blockerId)));
  const unlocked = new Set(unlocks.map((unlock) => unlock.visitorId));
  const items: ProfileVisitorItem[] = [];
  for (const row of latest) {
    const viewer = byId.get(row.viewerId);
    if (!viewer || blocked.has(row.viewerId)) continue;
    const visitedAt = row.createdAt.toISOString();
    const { birthDate, nationalityCountry, primaryLanguages, interestLanguages, ...user } = viewer;
    const hints: ProfileVisitorHints = {
      age: calculateProfileAge(birthDate, now) ?? null,
      nationalityCountry: nationalityCountry ?? null,
      primaryLanguages: primaryLanguages.slice(0, 2),
      interestLanguages: interestLanguages.slice(0, 2),
    };
    items.push(unlocked.has(row.viewerId)
      ? { token: row.id, unlocked: true, visitedAt, user }
      : { token: row.id, unlocked: false, visitedAt, hints });
    if (items.length >= MAX_VISITORS) break;
  }
  return items;
}

export class ProfileVisitorError extends Error {
  constructor(readonly code: "visitor_not_found" | "insufficient_coins") {
    super(code);
  }
}

/** Pays VISITOR_UNLOCK_COINS to see one visitor. Idempotent: an unlocked visitor is never charged again. */
export async function unlockProfileVisitor(input: { userId: string; token: string; idempotencyKey: string; now?: Date }): Promise<{ charged: boolean }> {
  const visit = await prisma.profileView.findFirst({
    where: { id: input.token, profileUserId: input.userId },
    select: { viewerId: true },
  });
  if (!visit || visit.viewerId === input.userId) throw new ProfileVisitorError("visitor_not_found");
  const visitorId = visit.viewerId;
  const existing = await prisma.profileVisitorUnlock.findUnique({
    where: { userId_visitorId: { userId: input.userId, visitorId } },
    select: { userId: true },
  });
  if (existing) return { charged: false };

  // Hash is only taken where billing is real; elsewhere (local, shadow) it opens for free.
  if (resolveUserCoinBillingMode(input.userId) !== "enforce") {
    await prisma.profileVisitorUnlock.upsert({
      where: { userId_visitorId: { userId: input.userId, visitorId } },
      create: { userId: input.userId, visitorId },
      update: {},
    });
    return { charged: false };
  }

  const key = `profile_visitor:${input.userId}:${visitorId}`;
  return withLockedWallet(input.userId, async (ctx) => {
    if (await hasLedgerEntry(ctx, key)) {
      await ctx.tx.profileVisitorUnlock.upsert({
        where: { userId_visitorId: { userId: input.userId, visitorId } },
        create: { userId: input.userId, visitorId },
        update: {},
      });
      return { charged: false };
    }
    const taken = await takeFromLots(ctx, {
      type: "spend",
      amountMicro: BigInt(VISITOR_UNLOCK_COINS) * MICRO_PER_COIN,
      idempotencyKey: key,
      meta: { feature: "profile_visitor_unlock", visitorId, clientKey: input.idempotencyKey },
    });
    // Not enough Hash: throwing rolls back whatever was taken.
    if (taken.shortfallMicro > 0n) throw new ProfileVisitorError("insufficient_coins");
    await ctx.tx.profileVisitorUnlock.create({ data: { userId: input.userId, visitorId } });
    return { charged: true };
  }, { now: input.now });
}

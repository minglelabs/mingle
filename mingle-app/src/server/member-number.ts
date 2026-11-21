import { prisma } from "@/lib/prisma";

/**
 * "You joined HashChat as member #N", shown on every profile (owner request,
 * 2026-11-21).
 *
 * N counts the accounts made before this one, by sign-up time (id breaks a
 * tie), plus one. Staff-run operator accounts and the official account are not
 * members: they get no number and are not counted. Deleted, banned and merged
 * accounts still count, so a number never changes once given.
 */
export type MemberNumberInput = {
  id: string;
  createdAt: Date;
  isOperator?: boolean | null;
  isOfficial?: boolean | null;
};

export function hasMemberNumber(user: Pick<MemberNumberInput, "isOperator" | "isOfficial">): boolean {
  return !user.isOperator && !user.isOfficial;
}

/** The `where` for "members who joined no later than this account" (exported for the test). */
export function memberNumberWhere(user: MemberNumberInput) {
  return {
    isOperator: false,
    isOfficial: false,
    OR: [
      { createdAt: { lt: user.createdAt } },
      { createdAt: user.createdAt, id: { lte: user.id } },
    ],
  };
}

export async function getMemberNumber(user: MemberNumberInput): Promise<number | null> {
  if (!hasMemberNumber(user) || !(user.createdAt instanceof Date) || !Number.isFinite(user.createdAt.getTime())) return null;
  try {
    const count = await prisma.user.count({ where: memberNumberWhere(user) });
    return count > 0 ? count : null;
  } catch (error) {
    // A profile still loads without its number.
    console.error("[member-number] count failed", error);
    return null;
  }
}

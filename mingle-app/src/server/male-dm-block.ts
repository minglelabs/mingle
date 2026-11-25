import { prisma } from "@/lib/prisma";

/**
 * A woman can stop men from opening a new 1:1 room with her (owner,
 * 2026-11-25; the setting is on her My page). Only a first room is checked:
 * a room that already exists, and her writing first, are never stopped.
 * Staff and the official account writing are never stopped either.
 */
export function blocksNewRoomFrom(
  sender: { gender: string | null; isOperator: boolean; isOfficial: boolean } | null,
  target: { gender: string | null; blockMaleDms: boolean } | null,
): boolean {
  if (!sender || !target) return false;
  if (sender.isOperator || sender.isOfficial) return false;
  return target.blockMaleDms && target.gender === "female" && sender.gender === "male";
}

export async function isNewRoomBlockedForMen(senderUserId: string, targetUserId: string): Promise<boolean> {
  const [sender, target] = await Promise.all([
    prisma.user.findUnique({ where: { id: senderUserId }, select: { gender: true, isOperator: true, isOfficial: true } }),
    prisma.user.findUnique({ where: { id: targetUserId }, select: { gender: true, blockMaleDms: true } }),
  ]);
  return blocksNewRoomFrom(sender, target);
}

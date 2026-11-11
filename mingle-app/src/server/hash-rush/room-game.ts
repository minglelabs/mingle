import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";

// A room's Hash Rush game, as far as the app server knows it: one game per
// chat room at a time (the game server already has one game room per chat
// room). The first member to join starts it, which leaves the room message
// that invites the others. Every phone in the game says so again every
// HASH_RUSH_HEARTBEAT_MS; once nobody has for HASH_RUSH_LIVE_WINDOW_MS (the
// last player quit, or every app was closed), the game is over and the next
// join starts a new one.

export const HASH_RUSH_HEARTBEAT_MS = 15_000;
export const HASH_RUSH_LIVE_WINDOW_MS = 45_000;

export type HashRushGameRecord = {
  sessionId: string | null;
  startedByUserId: string | null;
  activeAt: Date | null;
};

export interface HashRushGameStore {
  read(channelId: string): Promise<HashRushGameRecord | null>;
  /** Starts game `sessionId` unless one is running (seen since `cutoff`). True when this call started it. */
  tryStart(channelId: string, input: { sessionId: string; userId: string; now: Date; cutoff: Date }): Promise<boolean>;
  /**
   * A player is still in game `sessionId`. `revive` keeps a game that went
   * stale (this phone was away a while) as long as no other game started since.
   */
  touch(channelId: string, input: { sessionId: string; now: Date; cutoff: Date; revive: boolean }): Promise<boolean>;
}

export function isHashRushGameLive(record: HashRushGameRecord | null, now: Date): record is HashRushGameRecord & { sessionId: string } {
  return !!record?.sessionId && !!record.activeAt && record.activeAt.getTime() >= now.getTime() - HASH_RUSH_LIVE_WINDOW_MS;
}

export type HashRushJoinResult = {
  sessionId: string;
  startedByUserId: string | null;
  /** This join started the game: the room should hear about it. */
  started: boolean;
};

/**
 * Joins the room's game, or starts one when none runs. `sessionId` is the game
 * this phone is already in (a heartbeat): it stays in that one when it can.
 */
export async function joinHashRushGame(
  store: HashRushGameStore,
  input: { channelId: string; userId: string; sessionId?: string | null; now?: Date },
): Promise<HashRushJoinResult> {
  const now = input.now ?? new Date();
  const cutoff = new Date(now.getTime() - HASH_RUSH_LIVE_WINDOW_MS);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const record = await store.read(input.channelId);
    if (isHashRushGameLive(record, now)) {
      if (await store.touch(input.channelId, { sessionId: record.sessionId, now, cutoff, revive: false })) {
        return { sessionId: record.sessionId, startedByUserId: record.startedByUserId, started: false };
      }
      continue;
    }
    if (input.sessionId && record?.sessionId === input.sessionId) {
      if (await store.touch(input.channelId, { sessionId: input.sessionId, now, cutoff, revive: true })) {
        return { sessionId: input.sessionId, startedByUserId: record.startedByUserId, started: false };
      }
      continue;
    }
    const sessionId = randomUUID();
    if (await store.tryStart(input.channelId, { sessionId, userId: input.userId, now, cutoff })) {
      return { sessionId, startedByUserId: input.userId, started: true };
    }
    // Someone else started one at the same moment: join theirs.
  }
  throw new Error("hash_rush_join_conflict");
}

// Raw updates: the channel's updatedAt orders the room list, and a heartbeat
// must not move the room to the top. The column is a timestamp without time
// zone holding UTC (as Prisma writes it), so every time goes in as UTC: a
// plain Date parameter is a timestamptz, and the database would shift it by
// its own time zone (Asia/Seoul locally: +9 h, and every join conflicted).
const utc = (date: Date) => Prisma.sql`(${date}::timestamptz AT TIME ZONE 'UTC')`
export const prismaHashRushGameStore: HashRushGameStore = {
  async read(channelId) {
    const rows = await prisma.$queryRaw<Array<{ session_id: string | null; started_by: string | null; active_at: Date | null }>>`
      SELECT "hash_rush_session_id" AS session_id, "hash_rush_started_by_user_id" AS started_by, "hash_rush_active_at" AS active_at
      FROM "app"."app_conversation_channels" WHERE "id" = ${channelId} LIMIT 1`;
    const row = rows[0];
    return row ? { sessionId: row.session_id, startedByUserId: row.started_by, activeAt: row.active_at } : null;
  },
  async tryStart(channelId, { sessionId, userId, now, cutoff }) {
    const count = await prisma.$executeRaw`
      UPDATE "app"."app_conversation_channels"
      SET "hash_rush_session_id" = ${sessionId}, "hash_rush_started_by_user_id" = ${userId}, "hash_rush_active_at" = ${utc(now)}
      WHERE "id" = ${channelId}
        AND ("hash_rush_session_id" IS NULL OR "hash_rush_active_at" IS NULL OR "hash_rush_active_at" < ${utc(cutoff)})`;
    return count > 0;
  },
  async touch(channelId, { sessionId, now, cutoff, revive }) {
    const count = revive
      ? await prisma.$executeRaw`
          UPDATE "app"."app_conversation_channels" SET "hash_rush_active_at" = ${utc(now)}
          WHERE "id" = ${channelId} AND "hash_rush_session_id" = ${sessionId}`
      : await prisma.$executeRaw`
          UPDATE "app"."app_conversation_channels" SET "hash_rush_active_at" = ${utc(now)}
          WHERE "id" = ${channelId} AND "hash_rush_session_id" = ${sessionId} AND "hash_rush_active_at" >= ${utc(cutoff)}`;
    return count > 0;
  },
};

export function createMemoryHashRushGameStore(): HashRushGameStore & { records: Map<string, HashRushGameRecord> } {
  const records = new Map<string, HashRushGameRecord>();
  return {
    records,
    async read(channelId) {
      const record = records.get(channelId);
      return record ? { ...record } : { sessionId: null, startedByUserId: null, activeAt: null };
    },
    async tryStart(channelId, { sessionId, userId, now, cutoff }) {
      const record = records.get(channelId);
      if (record?.sessionId && record.activeAt && record.activeAt >= cutoff) return false;
      records.set(channelId, { sessionId, startedByUserId: userId, activeAt: now });
      return true;
    },
    async touch(channelId, { sessionId, now, cutoff, revive }) {
      const record = records.get(channelId);
      if (!record || record.sessionId !== sessionId) return false;
      if (!revive && (!record.activeAt || record.activeAt < cutoff)) return false;
      record.activeAt = now;
      return true;
    },
  };
}

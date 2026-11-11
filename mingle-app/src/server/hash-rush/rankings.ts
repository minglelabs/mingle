import { prisma } from "@/lib/prisma";
import { isHashRushGuestId } from "./invite";

// Hash Rush rankings: the game server reports each finished round (its
// `result()`, server/room.js in hash-rush) and the app server keeps one row per
// person in it (computers are not kept). A ranking adds those rows up per
// person, for everyone or for one chat room.

export type HashRushRoundReport = {
  matchId: string;
  channelId: string | null;
  playedAt: Date;
  teams: boolean;
  map: string | null;
  players: Array<{ userId: string; won: boolean; seeds: number; bonks: number; bonked: number }>;
};

const count = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.min(Math.floor(v), 10_000) : 0);

/** The chat room behind a game room id (`mingle-<channel id>`, src/server/hash-rush/ticket.ts). */
export function channelIdOfHashRushRoom(room: unknown): string | null {
  if (typeof room !== "string" || !room.startsWith("mingle-")) return null;
  const id = room.slice("mingle-".length);
  return /^[a-z0-9_-]{8,64}$/.test(id) ? id : null;
}

/** Reads the game server's report of a round; null when it is not one. */
export function parseHashRushRoundReport(body: unknown): HashRushRoundReport | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  if (typeof b.matchId !== "string" || !/^[a-z0-9]{4,32}$/i.test(b.matchId)) return null;
  if (!Array.isArray(b.players)) return null;
  const winners = new Set(Array.isArray(b.winners) ? b.winners.filter((v): v is number => Number.isInteger(v)) : []);
  const endedAt = typeof b.endedAt === "number" && Number.isFinite(b.endedAt) ? b.endedAt : Date.now();
  const seen = new Set<string>();
  const players: HashRushRoundReport["players"] = [];
  for (const raw of b.players) {
    if (!raw || typeof raw !== "object") continue;
    const p = raw as Record<string, unknown>;
    const userId = typeof p.userId === "string" ? p.userId.trim() : "";
    // Only people with a mingle account (an app ticket); computers have none.
    // Guests from an invite link are not accounts: they are not ranked.
    if (!userId || p.kind !== "remote" || seen.has(userId) || isHashRushGuestId(userId)) continue;
    seen.add(userId);
    players.push({ userId, won: Number.isInteger(p.id) && winners.has(p.id as number), seeds: count(p.seeds), bonks: count(p.kills), bonked: count(p.deaths) });
  }
  return {
    matchId: b.matchId,
    channelId: channelIdOfHashRushRoom(b.room),
    playedAt: new Date(endedAt),
    teams: b.teams === true,
    map: typeof b.map === "string" ? b.map.slice(0, 32) : null,
    players,
  };
}

/** Keeps a round; a report sent twice is kept once. */
export async function recordHashRushRound(report: HashRushRoundReport): Promise<number> {
  let kept = 0;
  for (const p of report.players) {
    kept += await prisma.$executeRaw`
      INSERT INTO "app"."app_hash_rush_round_players"
        ("id", "match_id", "channel_id", "user_id", "won", "seeds", "bonks", "bonked", "teams", "map", "played_at")
      VALUES (${`hr_${report.matchId}_${p.userId}`.slice(0, 120)}, ${report.matchId}, ${report.channelId}, ${p.userId}, ${p.won}, ${p.seeds}, ${p.bonks}, ${p.bonked}, ${report.teams}, ${report.map}, ${report.playedAt})
      ON CONFLICT ("match_id", "user_id") DO NOTHING`;
  }
  return kept;
}

export type HashRushRankingRow = {
  rank: number;
  userId: string;
  name: string | null;
  image: string | null;
  wins: number;
  rounds: number;
  seeds: number;
  bonks: number;
};

export const HASH_RUSH_RANKING_LIMIT = 50;

type AggregateRow = { user_id: string; wins: bigint | number; rounds: bigint | number; seeds: bigint | number; bonks: bigint | number };

/**
 * Most wins first, then fewer rounds (a better rate), then more seeds. The
 * viewer's own row comes along even when outside the top.
 */
export async function listHashRushRankings(input: { channelId?: string | null; viewerUserId?: string | null }): Promise<{ rows: HashRushRankingRow[]; me: HashRushRankingRow | null }> {
  const channelId = input.channelId ?? null;
  const all = await prisma.$queryRaw<AggregateRow[]>`
    SELECT "user_id",
      SUM(CASE WHEN "won" THEN 1 ELSE 0 END) AS wins,
      COUNT(*) AS rounds,
      SUM("seeds") AS seeds,
      SUM("bonks") AS bonks
    FROM "app"."app_hash_rush_round_players"
    WHERE (${channelId}::text IS NULL OR "channel_id" = ${channelId})
    GROUP BY "user_id"
    ORDER BY wins DESC, rounds ASC, seeds DESC, "user_id" ASC`;
  const ranked = all.map((row, index) => ({
    rank: index + 1,
    userId: row.user_id,
    wins: Number(row.wins),
    rounds: Number(row.rounds),
    seeds: Number(row.seeds),
    bonks: Number(row.bonks),
  }));
  const top = ranked.slice(0, HASH_RUSH_RANKING_LIMIT);
  const mine = input.viewerUserId ? ranked.find((row) => row.userId === input.viewerUserId) ?? null : null;
  const ids = [...new Set([...top.map((row) => row.userId), ...(mine ? [mine.userId] : [])])];
  const users = ids.length
    ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, image: true } })
    : [];
  const byId = new Map(users.map((user) => [user.id, user]));
  const withUser = (row: (typeof ranked)[number]): HashRushRankingRow => ({
    ...row,
    name: byId.get(row.userId)?.name ?? null,
    image: byId.get(row.userId)?.image ?? null,
  });
  return { rows: top.map(withUser), me: mine ? withUser(mine) : null };
}

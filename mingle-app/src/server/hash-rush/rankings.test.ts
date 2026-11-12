import { describe, expect, it } from "vitest";
import { channelIdOfHashRushRoom, parseHashRushRoundReport } from "./rankings";

describe("hash rush round reports", () => {
  it("keeps the people in a round (not the computers), who won, and the chat room behind the game room", () => {
    const report = parseHashRushRoundReport({
      room: "mingle-cmwbv51yp003gsh4f8iytc4cz",
      matchId: "abc123xyz",
      endedAt: 1_800_000_000_000,
      map: "desert",
      teams: true,
      winners: [0, 2],
      players: [
        { id: 0, kind: "remote", userId: "u1", seeds: 2, kills: 3, deaths: 1 },
        { id: 1, kind: "remote", userId: "u2", seeds: 0, kills: 1, deaths: 4 },
        { id: 2, kind: "bot:hard", userId: "", seeds: 1, kills: 0, deaths: 0 },
        { id: 3, kind: "remote", userId: "", seeds: 0, kills: 0, deaths: 0 },
      ],
    });
    expect(report).toMatchObject({ matchId: "abc123xyz", channelId: "cmwbv51yp003gsh4f8iytc4cz", teams: true, map: "desert" });
    expect(report!.players).toEqual([
      { userId: "u1", won: true, seeds: 2, bonks: 3, bonked: 1 },
      { userId: "u2", won: false, seeds: 0, bonks: 1, bonked: 4 },
    ]);
    expect(report!.playedAt.getTime()).toBe(1_800_000_000_000);
  });

  it("turns down what is not a round report", () => {
    expect(parseHashRushRoundReport(null)).toBeNull();
    expect(parseHashRushRoundReport({ matchId: "x" })).toBeNull();
    expect(parseHashRushRoundReport({ matchId: "bad id!", players: [] })).toBeNull();
    expect(channelIdOfHashRushRoom("lobby-1")).toBeNull();
  });
});

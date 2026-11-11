import { describe, expect, it } from "vitest";
import { HASH_RUSH_LIVE_WINDOW_MS, createMemoryHashRushGameStore, isHashRushGameLive, joinHashRushGame } from "./room-game";

const at = (ms: number) => new Date(1_800_000_000_000 + ms);

describe("a room's Hash Rush game", () => {
  it("the first join starts it, later joins join the same game", async () => {
    const store = createMemoryHashRushGameStore();
    const first = await joinHashRushGame(store, { channelId: "c1", userId: "a", now: at(0) });
    expect(first.started).toBe(true);
    expect(first.startedByUserId).toBe("a");
    const second = await joinHashRushGame(store, { channelId: "c1", userId: "b", now: at(5_000) });
    expect(second).toEqual({ sessionId: first.sessionId, startedByUserId: "a", started: false });
  });

  it("is one game per room: rooms do not share it", async () => {
    const store = createMemoryHashRushGameStore();
    const one = await joinHashRushGame(store, { channelId: "c1", userId: "a", now: at(0) });
    const two = await joinHashRushGame(store, { channelId: "c2", userId: "a", now: at(0) });
    expect(two.started).toBe(true);
    expect(two.sessionId).not.toBe(one.sessionId);
  });

  it("stays live while a player says so, and is over once nobody has for the window", async () => {
    const store = createMemoryHashRushGameStore();
    const game = await joinHashRushGame(store, { channelId: "c1", userId: "a", now: at(0) });
    await joinHashRushGame(store, { channelId: "c1", userId: "a", sessionId: game.sessionId, now: at(30_000) });
    expect(isHashRushGameLive(await store.read("c1"), at(30_000 + HASH_RUSH_LIVE_WINDOW_MS - 1))).toBe(true);
    expect(isHashRushGameLive(await store.read("c1"), at(30_000 + HASH_RUSH_LIVE_WINDOW_MS + 1))).toBe(false);
    const next = await joinHashRushGame(store, { channelId: "c1", userId: "b", now: at(200_000) });
    expect(next.started).toBe(true);
    expect(next.startedByUserId).toBe("b");
    expect(next.sessionId).not.toBe(game.sessionId);
  });

  it("a phone back after a while stays in its own game when no other started", async () => {
    const store = createMemoryHashRushGameStore();
    const game = await joinHashRushGame(store, { channelId: "c1", userId: "a", now: at(0) });
    const back = await joinHashRushGame(store, { channelId: "c1", userId: "a", sessionId: game.sessionId, now: at(120_000) });
    expect(back).toEqual({ sessionId: game.sessionId, startedByUserId: "a", started: false });
  });
});

describe("a game time from the future", () => {
  it("is not a live game: one written hours ahead (a time zone slip) is over", () => {
    const now = new Date("2026-11-11T15:00:00.000Z");
    const record = { sessionId: "s1", startedByUserId: "u1", activeAt: new Date(now.getTime() + 9 * 60 * 60_000) };
    expect(isHashRushGameLive(record, now)).toBe(false);
    expect(isHashRushGameLive({ ...record, activeAt: new Date(now.getTime() + 2_000) }, now)).toBe(true);
  });
});

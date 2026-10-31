import { describe, expect, it } from "vitest";
import {
  HASH_RUSH_TICKET_TTL_SEC,
  hashRushRoomId,
  issueHashRushTicket,
  signHashRushTicket,
  verifyHashRushTicket,
} from "@/server/hash-rush/ticket";

describe("hash rush tickets", () => {
  const payload = { room: "mingle-abc", userId: "user-1", name: "Mia", exp: 2_000_000_000 };

  it("round-trips and rejects a wrong secret, tampering and expiry", () => {
    const ticket = signHashRushTicket(payload, "secret-1");
    expect(verifyHashRushTicket(ticket, "secret-1", 1_900_000_000)).toEqual(payload);
    expect(verifyHashRushTicket(ticket, "secret-2", 1_900_000_000)).toBeNull();
    expect(verifyHashRushTicket(`x${ticket}`, "secret-1", 1_900_000_000)).toBeNull();
    expect(verifyHashRushTicket(ticket, "secret-1", 2_100_000_000)).toBeNull();
  });

  it("issues a two-hour ticket and says how long it lasts", () => {
    const now = 1_900_000_000;
    const issued = issueHashRushTicket({ room: "mingle-abc", userId: "user-1", name: "Mia" }, "secret-1", now);
    expect(HASH_RUSH_TICKET_TTL_SEC).toBe(2 * 60 * 60);
    expect(issued.exp).toBe(now + HASH_RUSH_TICKET_TTL_SEC);
    expect(issued.expiresIn).toBe(HASH_RUSH_TICKET_TTL_SEC);
    expect(verifyHashRushTicket(issued.ticket, "secret-1", issued.exp)).toEqual({
      room: "mingle-abc",
      userId: "user-1",
      name: "Mia",
      exp: issued.exp,
    });
    expect(verifyHashRushTicket(issued.ticket, "secret-1", issued.exp + 1)).toBeNull();
  });

  it("makes a game room id the game server accepts", () => {
    expect(hashRushRoomId("cmabc123XYZ")).toBe("mingle-cmabc123xyz");
    expect(hashRushRoomId("a/b c")).toBe("mingle-abc");
  });
});

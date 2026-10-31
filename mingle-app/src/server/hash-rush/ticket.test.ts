import { describe, expect, it } from "vitest";
import { hashRushRoomId, signHashRushTicket, verifyHashRushTicket } from "@/server/hash-rush/ticket";

describe("hash rush tickets", () => {
  const payload = { room: "mingle-abc", userId: "user-1", name: "Mia", exp: 2_000_000_000 };

  it("round-trips and rejects a wrong secret, tampering and expiry", () => {
    const ticket = signHashRushTicket(payload, "secret-1");
    expect(verifyHashRushTicket(ticket, "secret-1", 1_900_000_000)).toEqual(payload);
    expect(verifyHashRushTicket(ticket, "secret-2", 1_900_000_000)).toBeNull();
    expect(verifyHashRushTicket(`x${ticket}`, "secret-1", 1_900_000_000)).toBeNull();
    expect(verifyHashRushTicket(ticket, "secret-1", 2_100_000_000)).toBeNull();
  });

  it("makes a game room id the game server accepts", () => {
    expect(hashRushRoomId("cmabc123XYZ")).toBe("mingle-cmabc123xyz");
    expect(hashRushRoomId("a/b c")).toBe("mingle-abc");
  });
});

import { describe, expect, it } from "vitest";
import { isHashRushGuestId, newHashRushGuest, signHashRushInvite, verifyHashRushInvite } from "./invite";

describe("Hash Rush invite links", () => {
  it("round-trips a chat room id and refuses a changed or foreign code", () => {
    const code = signHashRushInvite("cmwbv51yp003gsh4f8iytc4cz", "s1");
    expect(verifyHashRushInvite(code, "s1")).toBe("cmwbv51yp003gsh4f8iytc4cz");
    expect(verifyHashRushInvite(code, "s2")).toBeNull();
    const other = signHashRushInvite("cmwbv51yp003gsh4f8iytc4cx", "s1");
    expect(verifyHashRushInvite(`${code.split(".")[0]}.${other.split(".")[1]}`, "s1")).toBeNull();
    expect(verifyHashRushInvite("nope", "s1")).toBeNull();
    expect(verifyHashRushInvite(code, "")).toBeNull();
  });

  it("gives each guest its own id, never an account's", () => {
    const a = newHashRushGuest();
    const b = newHashRushGuest();
    expect(a.userId).not.toBe(b.userId);
    expect(isHashRushGuestId(a.userId)).toBe(true);
    expect(isHashRushGuestId("cmwbv51yp003gsh4f8iytc4cz")).toBe(false);
    expect(a.name).toMatch(/^Guest\d{3}$/);
  });
});

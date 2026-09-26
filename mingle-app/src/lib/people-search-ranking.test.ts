import { describe, expect, it } from "vitest";
import { personMatchTier, rankPeopleByRelevance } from "./people-search-ranking";

describe("personMatchTier", () => {
  it("returns 0 for an exact name or handle match, case-insensitively", () => {
    expect(personMatchTier({ handle: "mina", name: "Someone" }, "Mina")).toBe(0);
    expect(personMatchTier({ handle: "user_x", name: "Mina" }, "mina")).toBe(0);
  });

  it("returns 1 for a prefix match", () => {
    expect(personMatchTier({ handle: "mina.song", name: null }, "mina")).toBe(1);
    expect(personMatchTier({ handle: null, name: "Mina Song" }, "mina")).toBe(1);
  });

  it("returns 2 for a contains match", () => {
    expect(personMatchTier({ handle: "amina", name: null }, "mina")).toBe(2);
    expect(personMatchTier({ handle: null, name: "Yamina" }, "mina")).toBe(2);
  });

  it("returns 3 when nothing matches or the query is blank", () => {
    expect(personMatchTier({ handle: "bob", name: "Bob" }, "mina")).toBe(3);
    expect(personMatchTier({ handle: "mina", name: "Mina" }, "   ")).toBe(3);
  });

  it("treats an @-prefixed query as a handle query", () => {
    expect(personMatchTier({ handle: "mina", name: null }, "@mina")).toBe(0);
    expect(personMatchTier({ handle: "mina.song", name: null }, "@mina")).toBe(1);
  });
});

describe("rankPeopleByRelevance", () => {
  it("sorts by tier and preserves input order within a tier", () => {
    const people = [
      { id: "contains", handle: "amina", name: "Yamina" },
      { id: "exact", handle: "mina", name: "Someone" },
      { id: "prefix-a", handle: "mina.a", name: null },
      { id: "prefix-b", handle: "mina.b", name: null },
    ];
    expect(rankPeopleByRelevance(people, "mina").map((p) => p.id)).toEqual([
      "exact",
      "prefix-a",
      "prefix-b",
      "contains",
    ]);
  });

  it("does not drop non-matching rows (filtering is the query's job)", () => {
    const people = [
      { id: "match", handle: "mina", name: null },
      { id: "no-match", handle: "bob", name: "Bob" },
    ];
    expect(rankPeopleByRelevance(people, "mina").map((p) => p.id)).toEqual(["match", "no-match"]);
  });
});

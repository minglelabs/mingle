import { describe, expect, it } from "vitest";
import {
  buildPeopleSearchSql,
  decodePeopleSearchCursor,
  encodePeopleSearchCursor,
  escapeLikePattern,
} from "./people-search-query";

describe("people-search-query", () => {
  it("round-trips the tier-aware cursor", () => {
    const cursor = { tier: 1, updatedAt: new Date("2026-09-01T00:00:00.000Z"), id: "u1" };
    expect(decodePeopleSearchCursor(encodePeopleSearchCursor(cursor))).toEqual(cursor);
    expect(decodePeopleSearchCursor(null)).toBeNull();
    expect(decodePeopleSearchCursor("x".repeat(600))).toBe("invalid");
  });

  it("escapes LIKE metacharacters so they match literally", () => {
    expect(escapeLikePattern("a_b%c\\")).toBe("a\\_b\\%c\\\\");
  });

  it("uses both the raw query and the @-stripped handle as tier needles", () => {
    const sql = buildPeopleSearchSql({ viewerId: "v", query: "@Mina", handleQuery: "Mina", cursor: null, take: 21 });
    expect(sql.values).toEqual(expect.arrayContaining(["@mina", "mina", "%Mina%", "%@Mina%", 21]));
    expect(sql.sql).not.toContain("ranked.tier >");
  });
});

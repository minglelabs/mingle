import { describe, expect, it } from "vitest";
import { parseHomeNotices, parseWeekBanCount } from "./home-notices";

describe("home notices", () => {
  it("hides the strip unless there was at least one ban this week", () => {
    expect(parseWeekBanCount({ weekBanCount: 3 })).toBe(3);
    expect(parseWeekBanCount({ weekBanCount: 0 })).toBe(0);
    expect(parseWeekBanCount({ weekBanCount: -2 })).toBe(0);
    expect(parseWeekBanCount({ weekBanCount: "3" })).toBe(0);
    expect(parseWeekBanCount(null)).toBe(0);
  });

  it("reads ban and text notices and drops what it cannot show", () => {
    const notices = parseHomeNotices({
      notices: [
        { id: "b", kind: "ban", maskedName: "J***", category: "harassment", publishedAt: "2026-11-14T00:00:00.000Z" },
        { id: "c", kind: "ban", category: "made-up", publishedAt: "2026-11-14T00:00:00.000Z" },
        { id: "g", kind: "general", title: "Hello", body: "", publishedAt: "2026-11-13T00:00:00.000Z" },
        { id: "e", kind: "general", title: "", body: "", publishedAt: "2026-11-13T00:00:00.000Z" },
        { id: "x", kind: "other", publishedAt: "2026-11-13T00:00:00.000Z" },
        { kind: "ban" },
        null,
      ],
    });
    expect(notices.map((notice) => notice.id)).toEqual(["b", "c", "g"]);
    expect(notices[1]).toMatchObject({ maskedName: "***", category: "other" });
    expect(parseHomeNotices({})).toEqual([]);
  });
});

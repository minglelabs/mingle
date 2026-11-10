import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import OperatorPostStatsRow from "./operator-post-stats-row";

const STATS = { views: 1200, likes: 60, comments: 12, follows: 6, profileVisits: 24, messages: 3 };

describe("app feed operator post stats row", () => {
  it("renders the counts and rates in the app language", () => {
    const html = renderToString(createElement(OperatorPostStatsRow, { stats: STATS, locale: "en" }));
    for (const label of ["Views", "Likes", "Comments", "Follows", "Profile", "Messages"]) expect(html).toContain(label);
    expect(html).toContain("1,200");
    expect(html).toContain("5%"); // likes
    expect(html).toContain("2%"); // profile visits
    expect(html).toContain("0.3%"); // messages (rounded to one decimal)
    expect(html).toContain('aria-label="Post stats (staff only)"');
  });

  it("uses the locale's labels and number format", () => {
    const html = renderToString(createElement(OperatorPostStatsRow, { stats: STATS, locale: "ko" }));
    expect(html).toContain("조회");
    expect(html).toContain("메시지");
    expect(html).toContain("1,200");
  });
});

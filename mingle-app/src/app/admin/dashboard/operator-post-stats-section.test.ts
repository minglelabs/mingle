import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import type { OperatorPostStatsListRow } from "@/server/operator-post-stats/load";
import { OperatorPostStatsRow } from "../_components/operator-post-stats-row";
import { OperatorPostStatsSection, OperatorPostStatsTotals } from "./operator-post-stats-section";
import { OperatorPostStatsTable, sortOperatorPostRows } from "./operator-post-stats-table";

function listRow(postId: string, views: number, follows: number, publishedAt: string): OperatorPostStatsListRow {
  return {
    postId,
    authorId: "op1",
    authorName: "Mina",
    authorHandle: "mina",
    snippet: `post ${postId}`,
    photoCount: 0,
    publishedAt,
    stats: { views, likes: 0, comments: 0, follows, profileVisits: 0, messages: 0 },
  };
}

describe("operator post stats in the admin tool", () => {
  it("shows every count and its share of the views", () => {
    const html = renderToString(createElement(OperatorPostStatsRow, {
      stats: { views: 200, likes: 30, comments: 5, follows: 4, profileVisits: 12, messages: 1 },
    }));
    for (const label of ["조회", "좋아요", "댓글", "팔로우", "프로필 방문", "메시지"]) expect(html).toContain(label);
    expect(html).toContain("15%"); // likes
    expect(html).toContain("2.5%"); // comments
    expect(html).toContain("6%"); // profile visits
    expect(html).toContain("0.5%"); // messages
  });

  it("shows a dash instead of a rate without views, and nothing without stats", () => {
    const html = renderToString(createElement(OperatorPostStatsRow, {
      stats: { views: 0, likes: 0, comments: 0, follows: 0, profileVisits: 1, messages: 0 },
    }));
    expect(html).toContain("-");
    expect(html).not.toContain("%");
    expect(renderToString(createElement(OperatorPostStatsRow, { stats: null }))).toBe("");
  });

  it("totals the range with rates over the summed views", () => {
    const html = renderToString(createElement(OperatorPostStatsTotals, {
      dashboard: {
        postCount: 3,
        totals: { views: 1000, likes: 80, comments: 10, follows: 25, profileVisits: 40, messages: 5 },
        rows: [],
      },
    }));
    expect(html).toContain("운영 계정 글");
    expect(html).toContain("1,000");
    expect(html).toContain("조회 대비 8%");
    expect(html).toContain("조회 대비 2.5%");
  });

  it("sorts by any count, newer post first on a tie", () => {
    const rows = [
      listRow("a", 10, 1, "2026-10-01T00:00:00.000Z"),
      listRow("b", 30, 0, "2026-10-02T00:00:00.000Z"),
      listRow("c", 10, 5, "2026-10-03T00:00:00.000Z"),
    ];
    expect(sortOperatorPostRows(rows, "views", "desc").map((row) => row.postId)).toEqual(["b", "c", "a"]);
    expect(sortOperatorPostRows(rows, "views", "asc").map((row) => row.postId)).toEqual(["c", "a", "b"]);
    expect(sortOperatorPostRows(rows, "follows", "desc").map((row) => row.postId)).toEqual(["c", "a", "b"]);
  });

  it("renders the table most viewed first, and an empty state", () => {
    const html = renderToString(createElement(OperatorPostStatsTable, {
      rows: [listRow("low", 1, 0, "2026-10-01T00:00:00.000Z"), listRow("high", 9, 0, "2026-10-01T00:00:00.000Z")],
    }));
    expect(html.indexOf("post high")).toBeLessThan(html.indexOf("post low"));
    expect(html).toContain("/admin/activity/posts/high");
    expect(renderToString(createElement(OperatorPostStatsTable, { rows: [] }))).toContain("운영 계정 글이 없습니다");
  });

  it("contains a failed load in the section", async () => {
    const failed = Promise.reject(new Error("db down"));
    failed.catch(() => undefined);
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const element = await OperatorPostStatsSection({ dashboardPromise: failed });
    expect(renderToString(element)).toContain("불러오지 못했습니다");
    spy.mockRestore();
  });
});

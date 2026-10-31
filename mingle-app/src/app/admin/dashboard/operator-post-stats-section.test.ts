import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";

const { queryRaw, findMany } = vi.hoisted(() => ({ queryRaw: vi.fn(), findMany: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { $queryRaw: queryRaw, post: { findMany } } }));

import type { OperatorPostStatKey } from "@/lib/operator-post-stats";
import { startOperatorPostStatsDashboardLoad, type OperatorPostStatsListRow } from "@/server/operator-post-stats/load";
import { OperatorPostStatsRow } from "../_components/operator-post-stats-row";
import {
  OperatorPostCountTile,
  OperatorPostStatTile,
  OperatorPostStatsTableCard,
  startOperatorPostStatsLoad,
} from "./operator-post-stats-section";
import { OperatorPostStatsTable, sortOperatorPostRows } from "./operator-post-stats-table";

afterEach(() => {
  vi.resetAllMocks();
});

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

  it("totals the range with rates over the summed views", async () => {
    const totals = Promise.resolve({
      postCount: 3,
      totals: { views: 1000, likes: 80, comments: 10, follows: 25, profileVisits: 40, messages: 5 },
    });
    const tile = async (statKey: OperatorPostStatKey) =>
      renderToString(await OperatorPostStatTile({ statKey, totalsPromise: totals }));

    expect(renderToString(await OperatorPostCountTile({ totalsPromise: totals }))).toContain("3개");
    expect(await tile("views")).toContain("1,000");
    expect(await tile("views")).toContain("글별 본 사람 합");
    expect(await tile("likes")).toContain("조회 대비 8%");
    expect(await tile("follows")).toContain("조회 대비 2.5%");
  });

  it("shows the count tiles before the attribution query is done, follows and messages after it", async () => {
    const counts = [
      { postId: "p1", authorId: "op1", publishedAt: new Date("2026-10-01T00:00:00Z"), views: 10, likes: 2, comments: 1, profileVisits: 3 },
      { postId: "p2", authorId: "op1", publishedAt: new Date("2026-10-02T00:00:00Z"), views: 30, likes: 0, comments: 0, profileVisits: 1 },
    ];
    let releaseCandidates: (rows: unknown[]) => void = () => {};
    // The counts query is started first, then the attribution query.
    queryRaw
      .mockResolvedValueOnce(counts)
      .mockReturnValueOnce(new Promise((resolve) => { releaseCandidates = resolve; }));
    findMany.mockResolvedValue([]);

    const load = startOperatorPostStatsDashboardLoad({ rangeStart: new Date("2026-10-01"), rangeEnd: new Date("2026-10-03") });
    const settled = new Set<string>();
    for (const [name, promise] of Object.entries(load)) void promise.then(() => settled.add(name));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect([...settled]).toEqual(["countTotals"]);
    await expect(load.countTotals).resolves.toEqual({ postCount: 2, totals: { views: 40, likes: 2, comments: 1, profileVisits: 4 } });
    const likes = renderToString(await OperatorPostStatTile({ statKey: "likes", totalsPromise: load.countTotals }));
    expect(likes).toContain("조회 대비 5%");

    releaseCandidates([]);
    await expect(load.totals).resolves.toEqual({
      postCount: 2,
      totals: { views: 40, likes: 2, comments: 1, follows: 0, profileVisits: 4, messages: 0 },
    });
    await expect(load.dashboard).resolves.toMatchObject({ postCount: 2 });
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

  it("contains a failed load in each card", async () => {
    const failed = Promise.reject(new Error("db down"));
    failed.catch(() => undefined);

    expect(renderToString(await OperatorPostStatsTableCard({ dashboardPromise: failed }))).toContain("불러오지 못했습니다");
    const tile = renderToString(await OperatorPostStatTile({ statKey: "follows", totalsPromise: failed }));
    expect(tile).toContain("팔로우");
    expect(tile).toContain('role="alert"');
    expect(renderToString(await OperatorPostCountTile({ totalsPromise: failed }))).toContain("불러오지 못했습니다");
  });

  it("logs a failure once, from the table's promise", async () => {
    queryRaw.mockRejectedValue(new Error("db down"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const load = startOperatorPostStatsLoad({ dayKeys: [], rangeStart: new Date("2026-10-01"), rangeEnd: new Date("2026-10-03") });
    await Promise.allSettled([load.countTotals, load.totals, load.dashboard]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError.mock.calls[0][0]).toBe("[admin-dashboard] operator_post_stats_failed");
    consoleError.mockRestore();
  });
});

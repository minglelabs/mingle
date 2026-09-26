import { describe, expect, it } from "vitest";
import type { FeedPostDto } from "@/lib/feed-post-dto";
import {
  initialPostGridState,
  isGridBusy,
  isSettledEmpty,
  planScrollRestore,
  postGridReducer,
} from "./post-grid-state";

const post = (id: string) => ({ id }) as unknown as FeedPostDto;

describe("postGridReducer", () => {
  it("keeps previous tiles while a new search loads (refreshing, not cleared)", () => {
    const loaded = postGridReducer(initialPostGridState, { type: "pageLoaded", append: false, posts: [post("a")], cursor: "c" });
    const refreshing = postGridReducer(loaded, { type: "sourceChanged", keepPrevious: true });
    expect(refreshing.posts.map((p) => p.id)).toEqual(["a"]);
    expect(refreshing.status).toBe("refreshing");
    expect(refreshing.cursor).toBeNull();
    expect(isGridBusy(refreshing)).toBe(true);
    expect(isSettledEmpty(refreshing)).toBe(false);
    const next = postGridReducer(refreshing, { type: "pageLoaded", append: false, posts: [post("b")], cursor: null });
    expect(next.posts.map((p) => p.id)).toEqual(["b"]);
  });

  it("leaves the area empty on a first search with nothing shown (no skeleton state)", () => {
    const state = postGridReducer(initialPostGridState, { type: "sourceChanged", keepPrevious: true });
    expect(state).toEqual(initialPostGridState);
    expect(state.status).toBe("loading");
  });

  it("clears on source change when retention is off (profile grids)", () => {
    const loaded = postGridReducer(initialPostGridState, { type: "pageLoaded", append: false, posts: [post("a")], cursor: null });
    expect(postGridReducer(loaded, { type: "sourceChanged", keepPrevious: false })).toEqual(initialPostGridState);
  });

  it("a failed first page settles EMPTY so a combined 'no results' can show", () => {
    const refreshing = postGridReducer(
      postGridReducer(initialPostGridState, { type: "pageLoaded", append: false, posts: [post("a")], cursor: null }),
      { type: "sourceChanged", keepPrevious: true },
    );
    const failed = postGridReducer(refreshing, { type: "pageFailed", append: false });
    expect(failed.status).toBe("error");
    expect(isSettledEmpty(failed)).toBe(true);
  });

  it("a failed next page keeps shown tiles and stops paging", () => {
    const loaded = postGridReducer(initialPostGridState, { type: "pageLoaded", append: false, posts: [post("a")], cursor: "c" });
    const failed = postGridReducer(loaded, { type: "pageFailed", append: true });
    expect(failed.posts.map((p) => p.id)).toEqual(["a"]);
    expect(failed.cursor).toBeNull();
    expect(failed.status).toBe("ready");
  });

  it("appends without duplicates", () => {
    const first = postGridReducer(initialPostGridState, { type: "pageLoaded", append: false, posts: [post("a"), post("b")], cursor: "c" });
    const second = postGridReducer(first, { type: "pageLoaded", append: true, posts: [post("b"), post("c")], cursor: null });
    expect(second.posts.map((p) => p.id)).toEqual(["a", "b", "c"]);
  });
});

describe("planScrollRestore", () => {
  it("loads more pages until the saved offset is reachable, then scrolls", () => {
    expect(planScrollRestore({ saved: 2400, maxScrollTop: 800, hasMore: true, pagesLoaded: 0 })).toBe("loadMore");
    expect(planScrollRestore({ saved: 2400, maxScrollTop: 2600, hasMore: true, pagesLoaded: 2 })).toBe("scroll");
  });
  it("scrolls as far as possible when pages run out or the cap is hit", () => {
    expect(planScrollRestore({ saved: 2400, maxScrollTop: 800, hasMore: false, pagesLoaded: 1 })).toBe("scroll");
    expect(planScrollRestore({ saved: 99999, maxScrollTop: 800, hasMore: true, pagesLoaded: 20 })).toBe("scroll");
  });
  it("does nothing without a saved offset", () => {
    expect(planScrollRestore({ saved: 0, maxScrollTop: 800, hasMore: true, pagesLoaded: 0 })).toBe("none");
  });
});

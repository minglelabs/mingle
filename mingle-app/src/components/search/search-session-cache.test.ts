import { afterEach, describe, expect, it } from "vitest";
import type { FeedPostDto } from "@/lib/feed-post-dto";
import {
  readGridSnapshot,
  readPeopleSnapshot,
  rememberGridSnapshot,
  rememberPeopleSnapshot,
  resetSearchSnapshotsForTest,
  SNAPSHOT_MAX_AGE_MS,
} from "./search-session-cache";

describe("search-session-cache", () => {
  afterEach(() => resetSearchSnapshotsForTest());

  it("restores the people results and post tiles of a query", () => {
    rememberPeopleSnapshot({ query: "mina", people: [{ id: "u1" } as never], hasMore: true });
    rememberGridSnapshot("search-posts:mina", { posts: [{ id: "p1" } as unknown as FeedPostDto], cursor: "c2" });
    expect(readPeopleSnapshot("mina")).toEqual({ query: "mina", people: [{ id: "u1" }], hasMore: true });
    expect(readGridSnapshot("search-posts:mina")).toEqual({ posts: [{ id: "p1" }], cursor: "c2" });
    expect(readPeopleSnapshot("other")).toBeNull();
  });

  it("expires old snapshots", () => {
    rememberPeopleSnapshot({ query: "mina", people: [], hasMore: false });
    expect(readPeopleSnapshot("mina", Date.now() + SNAPSHOT_MAX_AGE_MS + 1)).toBeNull();
  });
});

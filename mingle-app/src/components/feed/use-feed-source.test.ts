import { describe, expect, it, vi } from "vitest";
import type { FeedPostDto, FeedPostListResponse } from "@/lib/feed-post-dto";
import { resolveViewerStart } from "./use-feed-source";

function post(id: string, extra: Partial<FeedPostDto> = {}): FeedPostDto {
  return {
    id,
    author: { id: "author-1", handle: "h", name: "N", imageUrl: null },
    sourceText: `source ${id}`,
    sourceLanguage: "en",
    bodyVersion: 1,
    displayText: null,
    displayLanguage: null,
    translationState: "none",
    backgroundKey: "warm-cream",
    image: null,
    likeCount: 0,
    commentCount: 0,
    likedByMe: false,
    followingAuthor: false,
    isMine: false,
    publishedAt: "2026-09-25T00:00:00Z",
    visibility: "public",
    deletedAt: null,
    ...extra,
  };
}

const ids = (posts: FeedPostDto[]) => posts.map((p) => p.id);
const page = (pageIds: string[], nextCursor: string | null = null): FeedPostListResponse => ({
  posts: pageIds.map((id) => post(id)),
  nextCursor,
});

describe("resolveViewerStart (profile grid / search viewer)", () => {
  it("keeps grid order and starts at the selected post", async () => {
    const fetchNext = vi.fn();
    const result = await resolveViewerStart(post("p3"), page(["p1", "p2", "p3", "p4", "p5"], "c1"), fetchNext);

    expect(ids(result.posts)).toEqual(["p1", "p2", "p3", "p4", "p5"]);
    expect(result.startIndex).toBe(2);
    // Swiping down / up from the start moves to the next / previous grid post.
    expect(result.posts[result.startIndex + 1].id).toBe("p4");
    expect(result.posts[result.startIndex - 1].id).toBe("p2");
    expect(result.nextCursor).toBe("c1");
    expect(fetchNext).not.toHaveBeenCalled();
  });

  it("uses the fresh single-post payload in place", async () => {
    const fresh = post("p2", { likeCount: 9 });
    const result = await resolveViewerStart(fresh, page(["p1", "p2", "p3"]), vi.fn());
    expect(result.posts[1]).toBe(fresh);
    expect(result.startIndex).toBe(1);
  });

  it("follows the cursor until the selected post is found, keeping order", async () => {
    const fetchNext = vi
      .fn<(cursor: string) => Promise<FeedPostListResponse>>()
      .mockResolvedValueOnce(page(["p3", "p4"], "c2"))
      .mockResolvedValueOnce(page(["p5", "p6"], "c3"));

    const result = await resolveViewerStart(post("p5"), page(["p1", "p2"], "c1"), fetchNext);

    expect(fetchNext.mock.calls.map((c) => c[0])).toEqual(["c1", "c2"]);
    expect(ids(result.posts)).toEqual(["p1", "p2", "p3", "p4", "p5", "p6"]);
    expect(result.startIndex).toBe(4);
    expect(result.nextCursor).toBe("c3");
  });

  it("falls back to placing the post first when it is not in the list", async () => {
    const fetchNext = vi.fn().mockResolvedValueOnce(page(["p3"], null));
    const result = await resolveViewerStart(post("x"), page(["p1", "p2"], "c1"), fetchNext);

    expect(ids(result.posts)).toEqual(["x", "p1", "p2", "p3"]);
    expect(result.startIndex).toBe(0);
    expect(result.nextCursor).toBeNull();
  });

  it("stops paging after the bound", async () => {
    let n = 0;
    const fetchNext = vi.fn(async () => page([`q${++n}`], `c${n + 1}`));
    const result = await resolveViewerStart(post("x"), page(["p1"], "c1"), fetchNext, 3);

    expect(fetchNext).toHaveBeenCalledTimes(3);
    expect(result.startIndex).toBe(0);
    expect(ids(result.posts)).toEqual(["x", "p1", "q1", "q2", "q3"]);
    expect(result.nextCursor).toBe("c4");
  });
});

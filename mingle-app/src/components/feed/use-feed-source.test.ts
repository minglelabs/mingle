import { describe, expect, it, vi } from "vitest";
import type { FeedPostDto, FeedPostListResponse } from "@/lib/feed-post-dto";
import { FEED_REQUEST_TIMEOUT_MS, fetchWithTimeout, resolveViewerStart, shouldPrefetch } from "./use-feed-source";

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
    expect(result.prepended).toBe(true);
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

describe("fetchWithTimeout", () => {
  it("aborts a stalled request after the timeout and rejects with feed_timeout", async () => {
    vi.useFakeTimers();
    try {
      let seenSignal: AbortSignal | undefined;
      const stalled = vi.fn((_input: string, init?: RequestInit) => {
        seenSignal = init?.signal ?? undefined;
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        });
      }) as unknown as typeof fetch;
      const pending = fetchWithTimeout("/x", {}, FEED_REQUEST_TIMEOUT_MS, stalled);
      const assertion = expect(pending).rejects.toThrow("feed_timeout");
      await vi.advanceTimersByTimeAsync(FEED_REQUEST_TIMEOUT_MS - 1);
      expect(seenSignal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await assertion;
      expect(seenSignal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses a ~15s budget", () => {
    expect(FEED_REQUEST_TIMEOUT_MS).toBe(15_000);
  });

  it("passes a fast response through and does not fire the timer", async () => {
    vi.useFakeTimers();
    try {
      const res = new Response("{}", { status: 200 });
      const fast = vi.fn(async () => res) as unknown as typeof fetch;
      await expect(fetchWithTimeout("/x", {}, 1000, fast)).resolves.toBe(res);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("propagates a caller abort as that abort, not a timeout", async () => {
    const outer = new AbortController();
    const hang = vi.fn((_input: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("caller_abort")));
      }),
    ) as unknown as typeof fetch;
    const pending = fetchWithTimeout("/x", { signal: outer.signal }, 60_000, hang);
    outer.abort();
    await expect(pending).rejects.toThrow("caller_abort");
  });
});

describe("shouldPrefetch", () => {
  it("requests more near the end, including on the load-more status card", () => {
    expect(shouldPrefetch(10, 0)).toBe(false);
    expect(shouldPrefetch(10, 7)).toBe(true);
    // Parked on the last card or the status card after it.
    expect(shouldPrefetch(10, 9)).toBe(true);
    expect(shouldPrefetch(10, 10)).toBe(true);
    // A tiny feed is always "near the end".
    expect(shouldPrefetch(2, 0)).toBe(true);
  });
});

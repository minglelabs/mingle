"use client";

import { buildClientApiPath } from "@/lib/api-contract";
import type { FeedPostDto, FeedPostListResponse, FeedPostResponse } from "@/lib/feed-post-dto";
import { feedSourceEndpoint, postEndpoint, type FeedSource } from "@/lib/feed-routes";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  appendCyclePage,
  appendPage,
  createCycleList,
  patchCycleList,
  patchCycleListByAuthor,
  prependDeepLinkPost,
  removeAuthorFromCycleList,
  removeFromCycleList,
  type FeedCycleList,
  type FeedEntry,
} from "./feed-list";

/** How close to the end (in posts) we prefetch the next page. */
const PREFETCH_THRESHOLD = 3;
const DEFAULT_PAGE_LIMIT = 10;
/** A feed request that has not answered by then is treated as failed. */
export const FEED_REQUEST_TIMEOUT_MS = 15_000;

export type FeedLoadPhase = "loading" | "ready" | "error";

export type FeedSourceState = {
  /** Posts in display order (one per appearance; ids repeat across cycles). */
  posts: FeedPostDto[];
  /** Same order as `posts`, with a React key unique per appearance. */
  entries: FeedEntry[];
  /** First-load state — distinct from load-more so the UI shows the right thing. */
  phase: FeedLoadPhase;
  /** A subsequent page is being fetched. */
  loadingMore: boolean;
  /** The last load-more attempt failed (initial errors surface via `phase`). */
  loadMoreError: boolean;
  hasMore: boolean;
  /** The deep-linked post could not be loaded (gone / not visible). */
  deepLinkUnavailable: boolean;
  /**
   * Viewer route: index of `startPostId` in `posts` (list order is kept, so the
   * viewer must open at this index). 0 for the home feed / deep link.
   */
  startIndex: number;
};

export type UseFeedSourceOptions = {
  source: FeedSource;
  displayLanguage: string | null;
  /** A deep-linked post id to place first (home feed only). */
  deepLinkPostId?: string | null;
  /**
   * A remembered post (restore after returning to the feed) to place first
   * when there is no deep link. Unavailable → `deepLinkUnavailable`.
   */
  restorePostId?: string | null;
  /** In the viewer route, open the list (kept in its own order) at this post id. */
  startPostId?: string | null;
  limit?: number;
};

type UseFeedSourceReturn = FeedSourceState & {
  /** Fetch the next page if one exists and none is in flight. */
  loadMore: () => void;
  /** Called as the visible index changes; triggers prefetch near the end. */
  onVisibleIndexChange: (index: number) => void;
  /** Discard everything and re-fetch from the top (pull-to-refresh / new posts). */
  refresh: () => void;
  /** Optimistically patch every appearance of one post (like, comment count). */
  applyPatch: (postId: string, patch: Partial<FeedPostDto>) => void;
  /** Patch every on-screen post by one author (follow). */
  applyAuthorPatch: (authorId: string, patch: Partial<FeedPostDto>) => void;
  /** Drop one post (⋯ hide/archive/delete). */
  dropPost: (postId: string) => void;
  /** Drop every post by an author (block). */
  dropAuthor: (authorId: string) => void;
};

/** Max extra pages the viewer fetches to find the selected post in list order. */
export const VIEWER_START_MAX_PAGES = 10;

export type ViewerStartResult = {
  posts: FeedPostDto[];
  nextCursor: string | null;
  /** Index of the selected post in `posts` (0 when it had to be prepended). */
  startIndex: number;
  /** The selected post was not in the list and was placed first as a fallback. */
  prepended: boolean;
};

/**
 * Viewer (profile grid / search results): keep the list in its own order and
 * start at the selected post, so swiping moves to the next / previous post in
 * grid order. If the selected post is not on the first page, follow the cursor
 * (bounded) until it is found. Only if it never appears (e.g. it dropped out of
 * the list between grid and viewer) is it placed first as a fallback.
 */
export async function resolveViewerStart(
  startPost: FeedPostDto,
  firstPage: FeedPostListResponse,
  fetchNext: (cursor: string) => Promise<FeedPostListResponse>,
  maxExtraPages: number = VIEWER_START_MAX_PAGES,
): Promise<ViewerStartResult> {
  let posts = firstPage.posts;
  let nextCursor = firstPage.nextCursor;
  let index = posts.findIndex((p) => p.id === startPost.id);
  let pagesFetched = 0;
  while (index === -1 && nextCursor && pagesFetched < maxExtraPages) {
    const page = await fetchNext(nextCursor);
    pagesFetched += 1;
    posts = appendPage(posts, page.posts);
    nextCursor = page.nextCursor;
    index = posts.findIndex((p) => p.id === startPost.id);
  }
  if (index === -1) {
    return { posts: prependDeepLinkPost(startPost, posts), nextCursor, startIndex: 0, prepended: true };
  }
  // Prefer the freshly fetched single-post payload for the selected post.
  const copy = posts.slice();
  copy[index] = startPost;
  return { posts: copy, nextCursor, startIndex: index, prepended: false };
}


const EMPTY_LIST: FeedCycleList = createCycleList([]);

/**
 * `fetch` with a hard timeout. Aborts the request after `timeoutMs` and rejects
 * with `feed_timeout`, so a stalled network surfaces as an error + retry
 * instead of an endless spinner.
 */
export async function fetchWithTimeout(
  input: string,
  init: RequestInit = {},
  timeoutMs: number = FEED_REQUEST_TIMEOUT_MS,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const outer = init.signal;
  const onOuterAbort = () => controller.abort();
  if (outer) {
    if (outer.aborted) controller.abort();
    else outer.addEventListener("abort", onOuterAbort, { once: true });
  }
  try {
    return await fetchImpl(input, { ...init, signal: controller.signal });
  } catch (err) {
    if (timedOut) throw new Error("feed_timeout");
    throw err;
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener("abort", onOuterAbort);
  }
}

async function fetchList(endpoint: `/${string}`, signal: AbortSignal): Promise<FeedPostListResponse> {
  const res = await fetchWithTimeout(buildClientApiPath(endpoint), { cache: "no-store", signal });
  if (!res.ok) throw new Error(`feed_list_${res.status}`);
  const payload = (await res.json()) as FeedPostListResponse;
  return {
    posts: Array.isArray(payload.posts) ? payload.posts : [],
    nextCursor: typeof payload.nextCursor === "string" ? payload.nextCursor : null,
  };
}

async function fetchOne(
  postId: string,
  displayLanguage: string | null,
  signal: AbortSignal,
): Promise<FeedPostDto | null> {
  const res = await fetchWithTimeout(buildClientApiPath(postEndpoint(postId, { displayLanguage })), {
    cache: "no-store",
    signal,
  });
  if (res.status === 404 || res.status === 403 || res.status === 410) return null;
  if (!res.ok) throw new Error(`feed_post_${res.status}`);
  const payload = (await res.json()) as FeedPostResponse;
  return payload.post ?? null;
}

/**
 * Whether the reader is close enough to the end that the next page should be
 * requested. `visibleIndex` may equal `count` (the load-more status card).
 */
export function shouldPrefetch(count: number, visibleIndex: number, threshold: number = PREFETCH_THRESHOLD): boolean {
  return count - visibleIndex <= threshold;
}

/**
 * Loads a full-screen post list for one `FeedSource`, page by page.
 *
 * - Cursor pagination via `feedSourceEndpoint` + `buildClientApiPath`, each
 *   request bounded by `FEED_REQUEST_TIMEOUT_MS`.
 * - Prefetches the next page before the reader reaches the end, and keeps
 *   loading while the reader sits near the end (no index change needed).
 * - Never reorders posts already on screen. When the server wraps around to a
 *   new cycle, the repeated posts are appended as new appearances.
 * - A home deep-linked (or restored) post is fetched with `postEndpoint` and
 *   placed first.
 * - A viewer start post keeps the list order; `startIndex` says where to open.
 */
export function useFeedSource(options: UseFeedSourceOptions): UseFeedSourceReturn {
  const {
    source,
    displayLanguage,
    deepLinkPostId,
    restorePostId,
    startPostId,
    limit = DEFAULT_PAGE_LIMIT,
  } = options;

  const [list, setList] = useState<FeedCycleList>(EMPTY_LIST);
  const [phase, setPhase] = useState<FeedLoadPhase>("loading");
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [deepLinkUnavailable, setDeepLinkUnavailable] = useState(false);
  const [startIndex, setStartIndex] = useState(0);

  const cursorRef = useRef<string | null>(null);
  const loadingRef = useRef(false);
  const visibleIndexRef = useRef(0);
  // Bumped on refresh / source change to invalidate in-flight requests.
  const generationRef = useRef(0);

  // A stable key so an unrelated re-render (or a fresh-but-equal `source`
  // object) does not re-run the initial load.
  const sourceKey = useMemo(
    () =>
      `${JSON.stringify(source)}|${displayLanguage ?? ""}|${deepLinkPostId ?? ""}|${restorePostId ?? ""}|${startPostId ?? ""}`,
    [source, displayLanguage, deepLinkPostId, restorePostId, startPostId],
  );

  const runInitialLoad = useCallback(
    async (generation: number) => {
      const controller = new AbortController();
      setPhase("loading");
      setLoadMoreError(false);
      cursorRef.current = null;
      visibleIndexRef.current = 0;
      setHasMore(true);
      setDeepLinkUnavailable(false);
      setStartIndex(0);

      try {
        const pinnedId = deepLinkPostId ?? restorePostId ?? null;
        const anchorId = pinnedId ?? startPostId ?? null;
        const anchorPromise = anchorId
          ? fetchOne(anchorId, displayLanguage, controller.signal)
          : Promise.resolve(null);

        const listPromise = fetchList(
          feedSourceEndpoint(source, { limit, displayLanguage }),
          controller.signal,
        );

        const [anchor, first] = await Promise.all([anchorPromise, listPromise]);
        if (generation !== generationRef.current) return;

        if (!pinnedId && startPostId && anchor) {
          // Viewer: keep grid / search order and open at the selected post.
          const start = await resolveViewerStart(anchor, first, (cursor) =>
            fetchList(feedSourceEndpoint(source, { cursor, limit, displayLanguage }), controller.signal),
          );
          if (generation !== generationRef.current) return;
          cursorRef.current = start.nextCursor;
          setHasMore(Boolean(start.nextCursor));
          setList(
            start.prepended ? createCycleList(start.posts.slice(1), anchor) : createCycleList(start.posts),
          );
          setStartIndex(start.startIndex);
          visibleIndexRef.current = start.startIndex;
          setPhase("ready");
          return;
        }

        cursorRef.current = first.nextCursor;
        setHasMore(Boolean(first.nextCursor));

        if (pinnedId) {
          if (anchor) {
            // Home deep link / restored post goes first, ahead of the ranked feed.
            setList(createCycleList(first.posts, anchor));
          } else {
            // The linked / remembered post is gone or not visible: show the feed anyway.
            setDeepLinkUnavailable(true);
            setList(createCycleList(first.posts));
          }
        } else {
          setList(createCycleList(first.posts));
        }
        setPhase("ready");
      } catch (err) {
        if (controller.signal.aborted || generation !== generationRef.current) return;
        void err;
        setPhase("error");
      }
    },
    [source, displayLanguage, deepLinkPostId, restorePostId, startPostId, limit],
  );

  useEffect(() => {
    const generation = ++generationRef.current;
    loadingRef.current = false;
    setLoadingMore(false);
    void runInitialLoad(generation);
    // sourceKey captures every meaningful input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey]);

  const loadMore = useCallback(() => {
    if (loadingRef.current) return;
    if (!hasMore || !cursorRef.current) return;
    if (phase !== "ready") return;

    loadingRef.current = true;
    setLoadingMore(true);
    setLoadMoreError(false);
    const generation = generationRef.current;
    const controller = new AbortController();

    void (async () => {
      try {
        const page = await fetchList(
          feedSourceEndpoint(source, { cursor: cursorRef.current, limit, displayLanguage }),
          controller.signal,
        );
        if (generation !== generationRef.current) return;
        cursorRef.current = page.nextCursor;
        setHasMore(Boolean(page.nextCursor));
        if (page.posts.length === 0 && page.nextCursor) {
          // A cursor with nothing behind it: stop the automatic chain and let
          // the reader retry from the status card instead of looping.
          setLoadMoreError(true);
          return;
        }
        setList((prev) => appendCyclePage(prev, page.posts));
      } catch (err) {
        if (controller.signal.aborted || generation !== generationRef.current) return;
        void err;
        setLoadMoreError(true);
      } finally {
        if (generation === generationRef.current) {
          loadingRef.current = false;
          setLoadingMore(false);
        }
      }
    })();
  }, [hasMore, phase, source, displayLanguage, limit]);

  const count = list.entries.length;

  const onVisibleIndexChange = useCallback(
    (index: number) => {
      visibleIndexRef.current = index;
      if (shouldPrefetch(count, index)) loadMore();
    },
    [count, loadMore],
  );

  // Keep loading while the reader stays near the end — e.g. parked on the last
  // card, where the visible index never changes again.
  useEffect(() => {
    if (phase !== "ready" || loadingMore || loadMoreError || !hasMore) return;
    if (shouldPrefetch(count, visibleIndexRef.current)) loadMore();
  }, [phase, loadingMore, loadMoreError, hasMore, count, loadMore]);

  const refresh = useCallback(() => {
    const generation = ++generationRef.current;
    loadingRef.current = false;
    setLoadingMore(false);
    void runInitialLoad(generation);
  }, [runInitialLoad]);

  const applyPatch = useCallback((postId: string, patch: Partial<FeedPostDto>) => {
    setList((prev) => patchCycleList(prev, postId, patch));
  }, []);

  const applyAuthorPatch = useCallback((authorId: string, patch: Partial<FeedPostDto>) => {
    setList((prev) => patchCycleListByAuthor(prev, authorId, patch));
  }, []);

  const dropPost = useCallback((postId: string) => {
    setList((prev) => removeFromCycleList(prev, postId));
  }, []);

  const dropAuthor = useCallback((authorId: string) => {
    setList((prev) => removeAuthorFromCycleList(prev, authorId));
  }, []);

  const posts = useMemo(() => list.entries.map((entry) => entry.post), [list.entries]);

  return {
    posts,
    entries: list.entries,
    phase,
    loadingMore,
    loadMoreError,
    hasMore,
    deepLinkUnavailable,
    startIndex,
    loadMore,
    onVisibleIndexChange,
    refresh,
    applyPatch,
    applyAuthorPatch,
    dropPost,
    dropAuthor,
  };
}

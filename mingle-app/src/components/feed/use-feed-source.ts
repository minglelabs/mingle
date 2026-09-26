"use client";

import { buildClientApiPath } from "@/lib/api-contract";
import type { FeedPostDto, FeedPostListResponse, FeedPostResponse } from "@/lib/feed-post-dto";
import { feedSourceEndpoint, postEndpoint, type FeedSource } from "@/lib/feed-routes";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { appendPage, patchPost, prependDeepLinkPost, removeByAuthor, removePost } from "./feed-list";

/** How close to the end (in posts) we prefetch the next page. */
const PREFETCH_THRESHOLD = 3;
const DEFAULT_PAGE_LIMIT = 10;

export type FeedLoadPhase = "loading" | "ready" | "error";

export type FeedSourceState = {
  posts: FeedPostDto[];
  /** First-load state — distinct from load-more so the UI shows the right thing. */
  phase: FeedLoadPhase;
  /** A subsequent page is being fetched. */
  loadingMore: boolean;
  /** The last load-more attempt failed (initial errors surface via `phase`). */
  loadMoreError: boolean;
  hasMore: boolean;
  /** The deep-linked post could not be loaded (gone / not visible). */
  deepLinkUnavailable: boolean;
};

export type UseFeedSourceOptions = {
  source: FeedSource;
  displayLanguage: string | null;
  /** A deep-linked post id to place first (home feed only). */
  deepLinkPostId?: string | null;
  /** In the viewer route, start the list at this post id. */
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
  /** Optimistically patch one post (like, follow, comment count). */
  applyPatch: (postId: string, patch: Partial<FeedPostDto>) => void;
  /** Drop one post (⋯ hide/archive/delete). */
  dropPost: (postId: string) => void;
  /** Drop every post by an author (block). */
  dropAuthor: (authorId: string) => void;
};

async function fetchList(endpoint: `/${string}`, signal: AbortSignal): Promise<FeedPostListResponse> {
  const res = await fetch(buildClientApiPath(endpoint), { cache: "no-store", signal });
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
  const res = await fetch(buildClientApiPath(postEndpoint(postId, { displayLanguage })), {
    cache: "no-store",
    signal,
  });
  if (res.status === 404 || res.status === 403 || res.status === 410) return null;
  if (!res.ok) throw new Error(`feed_post_${res.status}`);
  const payload = (await res.json()) as FeedPostResponse;
  return payload.post ?? null;
}

/**
 * Loads a full-screen post list for one `FeedSource`, page by page.
 *
 * - Cursor pagination via `feedSourceEndpoint` + `buildClientApiPath`.
 * - Prefetches the next page before the reader reaches the end.
 * - De-duplicates and never reorders posts already on screen; new posts only
 *   appear on an explicit `refresh()`.
 * - A deep-linked / start post is fetched with `postEndpoint` and placed first.
 */
export function useFeedSource(options: UseFeedSourceOptions): UseFeedSourceReturn {
  const { source, displayLanguage, deepLinkPostId, startPostId, limit = DEFAULT_PAGE_LIMIT } = options;

  const [posts, setPosts] = useState<FeedPostDto[]>([]);
  const [phase, setPhase] = useState<FeedLoadPhase>("loading");
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [deepLinkUnavailable, setDeepLinkUnavailable] = useState(false);

  const cursorRef = useRef<string | null>(null);
  const loadingRef = useRef(false);
  // Bumped on refresh / source change to invalidate in-flight requests.
  const generationRef = useRef(0);

  // A stable key so an unrelated re-render does not re-run the initial load.
  const sourceKey = useMemo(
    () => `${JSON.stringify(source)}|${displayLanguage ?? ""}|${deepLinkPostId ?? ""}|${startPostId ?? ""}`,
    [source, displayLanguage, deepLinkPostId, startPostId],
  );

  const runInitialLoad = useCallback(
    async (generation: number) => {
      const controller = new AbortController();
      setPhase("loading");
      setLoadMoreError(false);
      cursorRef.current = null;
      setHasMore(true);
      setDeepLinkUnavailable(false);

      try {
        const anchorId = deepLinkPostId ?? startPostId ?? null;
        const anchorPromise = anchorId
          ? fetchOne(anchorId, displayLanguage, controller.signal)
          : Promise.resolve(null);

        const listPromise = fetchList(
          feedSourceEndpoint(source, { limit, displayLanguage }),
          controller.signal,
        );

        const [anchor, list] = await Promise.all([anchorPromise, listPromise]);
        if (generation !== generationRef.current) return;

        cursorRef.current = list.nextCursor;
        setHasMore(Boolean(list.nextCursor));

        if (anchorId) {
          if (anchor) {
            setPosts(prependDeepLinkPost(anchor, list.posts));
          } else {
            // The deep-linked post is gone / not visible: show the feed anyway.
            setDeepLinkUnavailable(true);
            setPosts(list.posts);
          }
        } else {
          setPosts(list.posts);
        }
        setPhase("ready");
      } catch (err) {
        if (controller.signal.aborted || generation !== generationRef.current) return;
        void err;
        setPhase("error");
      }
    },
    [source, displayLanguage, deepLinkPostId, startPostId, limit],
  );

  useEffect(() => {
    const generation = ++generationRef.current;
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
        const list = await fetchList(
          feedSourceEndpoint(source, { cursor: cursorRef.current, limit, displayLanguage }),
          controller.signal,
        );
        if (generation !== generationRef.current) return;
        cursorRef.current = list.nextCursor;
        setHasMore(Boolean(list.nextCursor));
        setPosts((prev) => appendPage(prev, list.posts));
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

  const onVisibleIndexChange = useCallback(
    (index: number) => {
      if (posts.length - index <= PREFETCH_THRESHOLD) {
        loadMore();
      }
    },
    [posts.length, loadMore],
  );

  const refresh = useCallback(() => {
    const generation = ++generationRef.current;
    loadingRef.current = false;
    void runInitialLoad(generation);
  }, [runInitialLoad]);

  const applyPatch = useCallback((postId: string, patch: Partial<FeedPostDto>) => {
    setPosts((prev) => patchPost(prev, postId, patch));
  }, []);

  const dropPost = useCallback((postId: string) => {
    setPosts((prev) => removePost(prev, postId));
  }, []);

  const dropAuthor = useCallback((authorId: string) => {
    setPosts((prev) => removeByAuthor(prev, authorId));
  }, []);

  return {
    posts,
    phase,
    loadingMore,
    loadMoreError,
    hasMore,
    deepLinkUnavailable,
    loadMore,
    onVisibleIndexChange,
    refresh,
    applyPatch,
    dropPost,
    dropAuthor,
  };
}

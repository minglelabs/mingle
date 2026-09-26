"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { FeedPostListResponse } from "@/lib/feed-post-dto";
import { buildClientApiPath } from "@/lib/api-contract";
import { searchCopy } from "@/i18n/search-copy";
import PostGridTile from "@/components/posts/post-grid-tile";
import { readGridScroll, rememberGridScroll } from "./grid-scroll-store";
import {
  initialPostGridState,
  isGridBusy,
  isSettledEmpty,
  planScrollRestore,
  postGridReducer,
} from "./post-grid-state";
import { readGridSnapshot, rememberGridSnapshot } from "./search-session-cache";

/**
 * A 3-column post grid (Instagram-style) with cursor pagination and scroll
 * restoration. Shared by the profile grid (my page + other profiles) and the
 * unified-search post results — the thumbnail rule and the layout live in one
 * place so the two surfaces cannot drift.
 *
 * The caller supplies the list endpoint (built with `feedSourceEndpoint`); the
 * grid owns fetching, infinite scroll, empty state and scroll memory. Tile
 * selection is delegated so each surface can route to the right viewer.
 */
export type PostGridProps = {
  locale: string;
  /** Endpoint string from `feedSourceEndpoint` (author or search). */
  endpoint: `/${string}`;
  /** Optional displayLanguage query param to append for translation policy. */
  displayLanguage?: string | null;
  /**
   * Stable scope for scroll memory, e.g. `profile:<authorId>` or
   * `search-posts:<query>`. Changing it starts a fresh grid.
   */
  scrollScope: string;
  onSelectPost: (postId: string) => void;
  /** The scrollable ancestor whose position is remembered; defaults to window. */
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
  /** Rendered when the grid has loaded and is empty. */
  emptyLabel?: string;
  /**
   * When set, the grid renders NO empty/loading placeholder of its own and
   * instead reports its settled-empty state here (a failed first page counts
   * as empty), so a parent can coordinate a combined "no results".
   */
  onEmptyStateChange?: (isSettledEmpty: boolean) => void;
  /** Keep the previous source's tiles on screen while a new source loads. */
  keepPreviousWhileLoading?: boolean;
  /** Reports first-page loading for the current source (for a small spinner). */
  onLoadingChange?: (isLoading: boolean) => void;
  /**
   * Keep a session snapshot of loaded tiles per scope and show it on return,
   * so back-navigation restores the same tiles without a refetch.
   */
  cacheResults?: boolean;
};

const PAGE_SIZE = 18;

function withPaging(endpoint: `/${string}`, cursor: string | null, displayLanguage?: string | null): string {
  const [path, existing] = endpoint.split("?", 2);
  const params = new URLSearchParams(existing ?? "");
  params.set("limit", String(PAGE_SIZE));
  if (cursor) params.set("cursor", cursor);
  if (displayLanguage) params.set("displayLanguage", displayLanguage);
  return `${path}?${params.toString()}` as string;
}

function maxScrollTopOf(container: HTMLElement | null | undefined): number {
  if (container) return Math.max(0, container.scrollHeight - container.clientHeight);
  if (typeof document === "undefined") return 0;
  return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
}

export default function PostGrid({
  locale,
  endpoint,
  displayLanguage,
  scrollScope,
  onSelectPost,
  scrollContainerRef,
  emptyLabel,
  onEmptyStateChange,
  keepPreviousWhileLoading = false,
  onLoadingChange,
  cacheResults = false,
}: PostGridProps) {
  const copy = searchCopy(locale);
  const [state, dispatch] = useReducer(postGridReducer, initialPostGridState);
  const { posts, cursor, status } = state;
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const requestSeqRef = useRef(0);
  const loadingMoreRef = useRef(false);
  // Back-navigation restore: the saved offset to reach, and how many pages
  // were loaded while getting there. While pending, scroll is not recorded
  // (a short first page would otherwise overwrite the saved offset).
  const restoreTargetRef = useRef(0);
  const restorePagesRef = useRef(0);
  // Only the grid's FIRST source (what it mounted with) is a back-navigation
  // return; a later source change (a new search query) starts fresh.
  const mountScopeRef = useRef(scrollScope);
  const leftMountScopeRef = useRef(false);

  const fetchPage = useCallback(async (pageCursor: string | null): Promise<void> => {
    const seq = ++requestSeqRef.current;
    try {
      const response = await fetch(buildClientApiPath(withPaging(endpoint, pageCursor, displayLanguage) as `/${string}`), {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("post_grid_fetch_failed");
      const payload = (await response.json()) as FeedPostListResponse;
      if (requestSeqRef.current !== seq) return;
      dispatch({
        type: "pageLoaded",
        append: Boolean(pageCursor),
        posts: Array.isArray(payload.posts) ? payload.posts : [],
        cursor: typeof payload.nextCursor === "string" ? payload.nextCursor : null,
      });
    } catch {
      if (requestSeqRef.current !== seq) return;
      // A failed fetch settles quietly (empty on the first page); no retry UI.
      dispatch({ type: "pageFailed", append: Boolean(pageCursor) });
    }
  }, [endpoint, displayLanguage]);

  // New source (endpoint/scope): restore a snapshot, or load the first page
  // while optionally keeping the previous source's tiles visible.
  useEffect(() => {
    if (scrollScope !== mountScopeRef.current) leftMountScopeRef.current = true;
    const isReturn = !leftMountScopeRef.current;
    restoreTargetRef.current = isReturn ? readGridScroll(scrollScope) : 0;
    restorePagesRef.current = 0;
    const snapshot = cacheResults && isReturn ? readGridSnapshot(scrollScope) : null;
    if (snapshot && snapshot.posts.length > 0) {
      requestSeqRef.current += 1;
      dispatch({ type: "restored", posts: snapshot.posts, cursor: snapshot.cursor });
      return;
    }
    dispatch({ type: "sourceChanged", keepPrevious: keepPreviousWhileLoading });
    void fetchPage(null);
    // keepPreviousWhileLoading / cacheResults are mount-time options.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchPage, scrollScope]);

  // Remember what is shown, so returning to this scope shows the same tiles.
  useEffect(() => {
    if (!cacheResults || status !== "ready" || posts.length === 0) return;
    rememberGridSnapshot(scrollScope, { posts, cursor });
  }, [cacheResults, status, posts, cursor, scrollScope]);

  // Restore scroll after back-navigation: load pages until the saved offset
  // is reachable, then scroll there once.
  useEffect(() => {
    if (status !== "ready" || restoreTargetRef.current <= 0) return;
    const frame = requestAnimationFrame(() => {
      const container = scrollContainerRef?.current;
      const saved = restoreTargetRef.current;
      const plan = planScrollRestore({
        saved,
        maxScrollTop: maxScrollTopOf(container),
        hasMore: Boolean(cursor),
        pagesLoaded: restorePagesRef.current,
      });
      if (plan === "loadMore") {
        restorePagesRef.current += 1;
        void fetchPage(cursor);
        return;
      }
      restoreTargetRef.current = 0;
      if (plan !== "scroll") return;
      if (container) container.scrollTop = saved;
      else window.scrollTo({ top: saved });
    });
    return () => cancelAnimationFrame(frame);
  }, [status, posts.length, cursor, fetchPage, scrollContainerRef]);

  // Remember scroll position as the user scrolls.
  useEffect(() => {
    const container = scrollContainerRef?.current;
    const target: HTMLElement | Window = container ?? (typeof window !== "undefined" ? window : (undefined as never));
    if (!target) return;
    const read = () => (container ? container.scrollTop : window.scrollY);
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (restoreTargetRef.current > 0) return;
        rememberGridScroll(scrollScope, read());
      });
    };
    target.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      target.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [scrollScope, scrollContainerRef]);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMoreRef.current || status !== "ready") return;
    loadingMoreRef.current = true;
    setIsLoadingMore(true);
    try {
      await fetchPage(cursor);
    } finally {
      loadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  }, [cursor, fetchPage, status]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !cursor || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (restoreTargetRef.current > 0) return;
      if (entries.some((entry) => entry.isIntersecting)) void loadMore();
    }, { root: scrollContainerRef?.current ?? null, rootMargin: "320px 0px" });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [cursor, loadMore, scrollContainerRef]);

  // Report settled-empty state (a failed first page counts as empty).
  const settledEmpty = isSettledEmpty(state);
  useEffect(() => {
    onEmptyStateChange?.(settledEmpty);
  }, [onEmptyStateChange, settledEmpty]);

  const busy = isGridBusy(state);
  useEffect(() => {
    onLoadingChange?.(busy);
  }, [onLoadingChange, busy]);

  if (status === "loading") {
    // No skeleton per spec; a quiet empty area while the first page loads.
    return <div className="min-h-[30vh]" aria-hidden="true" />;
  }

  if (posts.length === 0) {
    // Let a coordinating parent decide the message (e.g. combined "no results").
    if (onEmptyStateChange) return null;
    return (
      <p className="px-6 py-10 text-center text-[14px] text-gray-500" aria-live="polite">
        {emptyLabel ?? copy.profileGridEmpty}
      </p>
    );
  }

  return (
    <div aria-busy={status === "refreshing" || undefined}>
      <ul
        className="grid grid-cols-3 gap-0.5"
        aria-label={copy.profileGridLabel}
      >
        {posts.map((post) => (
          <li key={post.id}>
            <PostGridTile post={post} locale={locale} onSelect={onSelectPost} />
          </li>
        ))}
      </ul>
      {cursor ? (
        <div ref={sentinelRef} className="flex justify-center py-4 text-gray-400" aria-hidden={!isLoadingMore}>
          {isLoadingMore ? <span className="text-[13px]">{copy.loadMore}…</span> : <span className="h-px w-full" />}
        </div>
      ) : null}
    </div>
  );
}

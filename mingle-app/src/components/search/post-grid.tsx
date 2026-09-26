"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FeedPostDto, FeedPostListResponse } from "@/lib/feed-post-dto";
import { buildClientApiPath } from "@/lib/api-contract";
import { searchCopy } from "@/i18n/search-copy";
import PostGridTile from "@/components/posts/post-grid-tile";
import { readGridScroll, rememberGridScroll } from "./grid-scroll-store";

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
   * instead reports its loaded-empty state here, so a parent can coordinate a
   * combined empty message (e.g. "no results" only when people are empty too).
   */
  onEmptyStateChange?: (isLoadedAndEmpty: boolean) => void;
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

export default function PostGrid({
  locale,
  endpoint,
  displayLanguage,
  scrollScope,
  onSelectPost,
  scrollContainerRef,
  emptyLabel,
  onEmptyStateChange,
}: PostGridProps) {
  const copy = searchCopy(locale);
  const [posts, setPosts] = useState<FeedPostDto[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const requestSeqRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const restoredRef = useRef(false);

  const fetchPage = useCallback(async (pageCursor: string | null): Promise<void> => {
    const seq = ++requestSeqRef.current;
    try {
      const response = await fetch(buildClientApiPath(withPaging(endpoint, pageCursor, displayLanguage) as `/${string}`), {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("post_grid_fetch_failed");
      const payload = (await response.json()) as FeedPostListResponse;
      if (requestSeqRef.current !== seq) return;
      const nextPosts = Array.isArray(payload.posts) ? payload.posts : [];
      setPosts((current) => {
        if (!pageCursor) return nextPosts;
        const seen = new Set(current.map((post) => post.id));
        return [...current, ...nextPosts.filter((post) => !seen.has(post.id))];
      });
      setCursor(typeof payload.nextCursor === "string" ? payload.nextCursor : null);
      setStatus("ready");
    } catch {
      if (requestSeqRef.current !== seq) return;
      // A failed fetch shows the empty/quiet state; the grid has no retry UI.
      if (!pageCursor) setPosts([]);
      setCursor(null);
      setStatus(pageCursor ? "ready" : "error");
    }
  }, [endpoint, displayLanguage]);

  // Reset and load the first page when the source (endpoint/scope) changes.
  useEffect(() => {
    restoredRef.current = false;
    setPosts([]);
    setCursor(null);
    setStatus("loading");
    void fetchPage(null);
  }, [fetchPage, scrollScope]);

  // Restore scroll once the first page is painted.
  useEffect(() => {
    if (status !== "ready" || restoredRef.current) return;
    restoredRef.current = true;
    const saved = readGridScroll(scrollScope);
    if (saved <= 0) return;
    const container = scrollContainerRef?.current;
    requestAnimationFrame(() => {
      if (container) container.scrollTop = saved;
      else window.scrollTo({ top: saved });
    });
  }, [status, scrollScope, scrollContainerRef]);

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
    if (!cursor || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setIsLoadingMore(true);
    try {
      await fetchPage(cursor);
    } finally {
      loadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  }, [cursor, fetchPage]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !cursor || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadMore();
    }, { root: scrollContainerRef?.current ?? null, rootMargin: "320px 0px" });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [cursor, loadMore, scrollContainerRef]);

  // Report loaded-empty state so a parent can coordinate a combined empty view.
  useEffect(() => {
    if (!onEmptyStateChange) return;
    onEmptyStateChange(status === "ready" && posts.length === 0);
  }, [onEmptyStateChange, status, posts.length]);

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
    <div>
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

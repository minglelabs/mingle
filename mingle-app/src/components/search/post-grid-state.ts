import type { FeedPostDto } from "@/lib/feed-post-dto";

/**
 * Pure state for `PostGrid`, so retention and failure handling are tested
 * without a DOM.
 *
 * - `loading`: first page for this source, nothing on screen (no skeleton).
 * - `refreshing`: a new source is loading while the previous source's tiles
 *   stay visible (search keeps old results; only a small spinner shows).
 * - `ready` / `error`: settled. An error on the first page settles EMPTY, so a
 *   parent can show its combined "no results".
 */
export type PostGridStatus = "loading" | "refreshing" | "ready" | "error";

export type PostGridState = {
  posts: FeedPostDto[];
  cursor: string | null;
  status: PostGridStatus;
};

export type PostGridAction =
  | { type: "sourceChanged"; keepPrevious: boolean }
  | { type: "restored"; posts: FeedPostDto[]; cursor: string | null }
  | { type: "pageLoaded"; append: boolean; posts: FeedPostDto[]; cursor: string | null }
  | { type: "pageFailed"; append: boolean };

export const initialPostGridState: PostGridState = { posts: [], cursor: null, status: "loading" };

export function postGridReducer(state: PostGridState, action: PostGridAction): PostGridState {
  switch (action.type) {
    case "sourceChanged":
      if (action.keepPrevious && state.posts.length > 0) {
        return { posts: state.posts, cursor: null, status: "refreshing" };
      }
      return initialPostGridState;
    case "restored":
      return { posts: action.posts, cursor: action.cursor, status: "ready" };
    case "pageLoaded": {
      if (!action.append) return { posts: action.posts, cursor: action.cursor, status: "ready" };
      const seen = new Set(state.posts.map((post) => post.id));
      return {
        posts: [...state.posts, ...action.posts.filter((post) => !seen.has(post.id))],
        cursor: action.cursor,
        status: "ready",
      };
    }
    case "pageFailed":
      // A failed next page keeps what is shown; a failed first page settles empty.
      if (action.append) return { ...state, cursor: null, status: "ready" };
      return { posts: [], cursor: null, status: "error" };
  }
}

/** Settled for the current source (ready or failed) with no tile to show. */
export function isSettledEmpty(state: PostGridState): boolean {
  return (state.status === "ready" || state.status === "error") && state.posts.length === 0;
}

export function isGridBusy(state: PostGridState): boolean {
  return state.status === "loading" || state.status === "refreshing";
}

/**
 * Back-navigation scroll restore: load more pages until the saved offset is
 * reachable (or pages run out / the cap is hit), then scroll.
 */
export function planScrollRestore({
  saved,
  maxScrollTop,
  hasMore,
  pagesLoaded,
  maxPages = 20,
}: {
  saved: number;
  maxScrollTop: number;
  hasMore: boolean;
  pagesLoaded: number;
  maxPages?: number;
}): "none" | "loadMore" | "scroll" {
  if (saved <= 0) return "none";
  if (saved > maxScrollTop && hasMore && pagesLoaded < maxPages) return "loadMore";
  return "scroll";
}

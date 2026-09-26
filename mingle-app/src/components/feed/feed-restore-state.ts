import type { FeedSource } from "@/lib/feed-routes";

/**
 * Restores "where you were" when returning to a feed source after visiting a
 * profile, a conversation, or a comment sheet: which post was active, and each
 * post's expand + read (scroll) position.
 *
 * Backed by `sessionStorage` so it survives a client route change within the
 * tab but not a full app restart. A missing / corrupt entry degrades to "start
 * from the top", never an error.
 */

export type FeedPostViewState = {
  expanded: boolean;
  scrollTop: number;
};

export type FeedRestoreState = {
  activePostId: string | null;
  posts: Record<string, FeedPostViewState>;
};

const STORAGE_PREFIX = "mingle:feed-restore:";

export function feedSourceCacheKey(source: FeedSource): string {
  switch (source.kind) {
    case "home":
      return "home";
    case "author":
      return `author:${source.authorId}`;
    case "search":
      return `search:${source.query}`;
  }
}

function storageKey(source: FeedSource): string {
  return `${STORAGE_PREFIX}${feedSourceCacheKey(source)}`;
}

export function readFeedRestoreState(source: FeedSource): FeedRestoreState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey(source));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FeedRestoreState;
    if (!parsed || typeof parsed !== "object" || typeof parsed.posts !== "object") return null;
    return {
      activePostId: typeof parsed.activePostId === "string" ? parsed.activePostId : null,
      posts: parsed.posts ?? {},
    };
  } catch {
    return null;
  }
}

export function writeFeedRestoreState(source: FeedSource, state: FeedRestoreState): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(storageKey(source), JSON.stringify(state));
  } catch {
    // Storage full / disabled — restore is best-effort.
  }
}

export function clearFeedRestoreState(source: FeedSource): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(storageKey(source));
  } catch {
    // Ignore.
  }
}

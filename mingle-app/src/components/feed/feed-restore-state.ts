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

// ---------------------------------------------------------------------------
// Restore session: read once, synchronously, before any card mounts; write
// only after the list has been restored, so the empty first render can never
// overwrite the remembered position.
// ---------------------------------------------------------------------------

type RestoreStorage = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): RestoreStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function parseRestoreState(raw: string | null): FeedRestoreState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as FeedRestoreState;
    if (!parsed || typeof parsed !== "object" || typeof parsed.posts !== "object" || !parsed.posts) return null;
    return {
      activePostId: typeof parsed.activePostId === "string" ? parsed.activePostId : null,
      posts: parsed.posts,
    };
  } catch {
    return null;
  }
}

export type FeedRestoreSession = {
  /** What was saved when this shell mounted (read synchronously). */
  readonly initial: FeedRestoreState | null;
  /** Allow writes. Call once the list is on screen and the start is applied. */
  markReady(): void;
  readonly ready: boolean;
  /** Save the current position. A no-op before `markReady()`. */
  persist(state: FeedRestoreState): void;
};

export function createFeedRestoreSession(
  source: FeedSource,
  storage: RestoreStorage | null = defaultStorage(),
): FeedRestoreSession {
  const key = storageKey(source);
  let initial: FeedRestoreState | null = null;
  try {
    initial = storage ? parseRestoreState(storage.getItem(key)) : null;
  } catch {
    initial = null;
  }
  let ready = false;
  return {
    initial,
    get ready() {
      return ready;
    },
    markReady() {
      ready = true;
    },
    persist(state) {
      if (!ready || !storage) return;
      try {
        storage.setItem(key, JSON.stringify(state));
      } catch {
        // Storage full / disabled — restore is best-effort.
      }
    },
  };
}

/**
 * Which post the shell opens on. Precedence: a home deep link (`?postId=`),
 * then a viewer start post, then the remembered active post. Only the
 * remembered post needs the list to fetch it (`restorePostId`).
 */
export function planFeedStart(options: {
  deepLinkPostId: string | null;
  startPostId: string | null;
  saved: FeedRestoreState | null;
}): { kind: "deep-link" | "viewer" | "restore" | "top"; postId: string | null; restorePostId: string | null } {
  if (options.deepLinkPostId) return { kind: "deep-link", postId: options.deepLinkPostId, restorePostId: null };
  if (options.startPostId) return { kind: "viewer", postId: options.startPostId, restorePostId: null };
  const remembered = options.saved?.activePostId ?? null;
  if (remembered) return { kind: "restore", postId: remembered, restorePostId: remembered };
  return { kind: "top", postId: null, restorePostId: null };
}

/**
 * Opens a deep-linked comment sheet (`?commentId=`) exactly once: the first
 * time its post is on screen. Later list changes (load more, patches) and a
 * closed sheet never reopen it.
 */
export function createDeepLinkCommentLatch(postId: string | null, commentId: string | null) {
  let consumed = !postId || !commentId;
  return {
    take(hasPost: (id: string) => boolean): { postId: string; commentId: string } | null {
      if (consumed || !postId || !commentId) return null;
      if (!hasPost(postId)) return null;
      consumed = true;
      return { postId, commentId };
    },
    get consumed() {
      return consumed;
    },
  };
}

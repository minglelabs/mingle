import type { FeedPostDto } from "@/lib/feed-post-dto";

/**
 * Pure list-maintenance helpers for the feed. No React, no DOM, no fetch —
 * everything here is unit-tested so the ordering guarantees ("a new post that
 * arrives while reading never reorders the list") are verified independently
 * of the fetch hook.
 */

/**
 * Append a freshly fetched page to the posts already on screen, keeping the
 * existing order and dropping any id already present. The server owns ordering
 * within a page; our only job is to not duplicate and not reorder.
 */
export function appendPage(existing: FeedPostDto[], incoming: FeedPostDto[]): FeedPostDto[] {
  if (incoming.length === 0) return existing;
  const seen = new Set(existing.map((p) => p.id));
  const merged = existing.slice();
  for (const post of incoming) {
    if (seen.has(post.id)) continue;
    seen.add(post.id);
    merged.push(post);
  }
  return merged;
}

/**
 * Prepend a deep-linked post to the ranked feed: it goes first, and any later
 * copy of the same id in the ranked list is removed so it is not shown twice.
 */
export function prependDeepLinkPost(deepLinked: FeedPostDto, ranked: FeedPostDto[]): FeedPostDto[] {
  return [deepLinked, ...ranked.filter((p) => p.id !== deepLinked.id)];
}

/**
 * Replace a single post in place (same position) when its server state changes
 * — e.g. after a comment-count update or a re-fetch. Returns the same array
 * reference when the id is absent, so callers can skip a re-render.
 */
export function replacePost(posts: FeedPostDto[], next: FeedPostDto): FeedPostDto[] {
  const idx = posts.findIndex((p) => p.id === next.id);
  if (idx === -1) return posts;
  const copy = posts.slice();
  copy[idx] = next;
  return copy;
}

/** Patch specific fields of one post by id, preserving its position. */
export function patchPost(
  posts: FeedPostDto[],
  postId: string,
  patch: Partial<FeedPostDto>,
): FeedPostDto[] {
  const idx = posts.findIndex((p) => p.id === postId);
  if (idx === -1) return posts;
  const copy = posts.slice();
  copy[idx] = { ...copy[idx], ...patch };
  return copy;
}

/** Remove a single post by id (⋯ hide/archive/delete). */
export function removePost(posts: FeedPostDto[], postId: string): FeedPostDto[] {
  const next = posts.filter((p) => p.id !== postId);
  return next.length === posts.length ? posts : next;
}

/** Remove every post by one author (block author). */
export function removeByAuthor(posts: FeedPostDto[], authorId: string): FeedPostDto[] {
  const next = posts.filter((p) => p.author.id !== authorId);
  return next.length === posts.length ? posts : next;
}

// ---------------------------------------------------------------------------
// Cycling list (home feed wrap-around)
// ---------------------------------------------------------------------------

/** One on-screen appearance of a post. `key` is unique per appearance. */
export type FeedEntry = {
  key: string;
  post: FeedPostDto;
};

/**
 * The feed as a sequence of cycles. Server contract: within one cycle an id
 * never repeats; at the end the server restarts from a fresh snapshot at
 * offset 0, so ids repeat in the next cycle. `nextCursor` stays non-null while
 * there are posts.
 */
export type FeedCycleList = {
  entries: FeedEntry[];
  /** Current cycle number (0 = first pass). */
  cycle: number;
  /** Ids already shown in the current cycle. */
  cycleIds: ReadonlySet<string>;
  /**
   * A deep-linked (or restored) post placed first that the ranked stream has
   * not delivered yet in cycle 0. When the ranked stream brings it in cycle 0
   * it is dropped silently instead of counting as a wrap.
   */
  pendingPinnedId: string | null;
};

function entryKey(cycle: number, id: string): string {
  return `${cycle}:${id}`;
}

/**
 * Start a cycle list from the first ranked page, optionally with a pinned post
 * (home deep link / restored post / viewer fallback) placed first.
 */
export function createCycleList(ranked: FeedPostDto[], pinned?: FeedPostDto | null): FeedCycleList {
  const ids = new Set<string>();
  const entries: FeedEntry[] = [];
  const push = (post: FeedPostDto) => {
    if (ids.has(post.id)) return;
    ids.add(post.id);
    entries.push({ key: entryKey(0, post.id), post });
  };
  const rankedHasPinned = pinned ? ranked.some((p) => p.id === pinned.id) : false;
  if (pinned) push(pinned);
  for (const post of ranked) {
    if (pinned && post.id === pinned.id) continue;
    push(post);
  }
  return {
    entries,
    cycle: 0,
    cycleIds: ids,
    pendingPinnedId: pinned && !rankedHasPinned ? pinned.id : null,
  };
}

/**
 * Append a fetched page. If the page carries an id already shown in the
 * current cycle, the server has wrapped: the whole page starts a new cycle and
 * is appended (not dropped), with keys unique to that cycle. The pinned post
 * arriving again during cycle 0 is dropped silently and is not a wrap.
 */
export function appendCyclePage(list: FeedCycleList, incoming: FeedPostDto[]): FeedCycleList {
  if (incoming.length === 0) return list;

  let pendingPinnedId = list.pendingPinnedId;
  let page = incoming;
  if (list.cycle === 0 && pendingPinnedId) {
    const pinnedId = pendingPinnedId;
    if (page.some((p) => p.id === pinnedId)) {
      page = page.filter((p) => p.id !== pinnedId);
      pendingPinnedId = null;
    }
  }
  if (page.length === 0) {
    return pendingPinnedId === list.pendingPinnedId ? list : { ...list, pendingPinnedId };
  }

  const wraps = page.some((p) => list.cycleIds.has(p.id));
  const cycle = wraps ? list.cycle + 1 : list.cycle;
  const cycleIds = new Set(wraps ? [] : list.cycleIds);
  if (wraps) pendingPinnedId = null;

  const entries = list.entries.slice();
  for (const post of page) {
    // Defensive: never a duplicate within one cycle (keys must stay unique).
    if (cycleIds.has(post.id)) continue;
    cycleIds.add(post.id);
    entries.push({ key: entryKey(cycle, post.id), post });
  }
  return { entries, cycle, cycleIds, pendingPinnedId };
}

function mapEntries(list: FeedCycleList, fn: (post: FeedPostDto) => FeedPostDto): FeedCycleList {
  let changed = false;
  const entries = list.entries.map((entry) => {
    const next = fn(entry.post);
    if (next === entry.post) return entry;
    changed = true;
    return { key: entry.key, post: next };
  });
  return changed ? { ...list, entries } : list;
}

function filterEntries(list: FeedCycleList, keep: (post: FeedPostDto) => boolean): FeedCycleList {
  const entries = list.entries.filter((entry) => keep(entry.post));
  return entries.length === list.entries.length ? list : { ...list, entries };
}

/** Patch every appearance of one post (like, comment count, edit). */
export function patchCycleList(
  list: FeedCycleList,
  postId: string,
  patch: Partial<FeedPostDto>,
): FeedCycleList {
  return mapEntries(list, (post) => (post.id === postId ? { ...post, ...patch } : post));
}

/** Patch every post by one author on screen (follow). */
export function patchCycleListByAuthor(
  list: FeedCycleList,
  authorId: string,
  patch: Partial<FeedPostDto>,
): FeedCycleList {
  return mapEntries(list, (post) => (post.author.id === authorId ? { ...post, ...patch } : post));
}

/** Replace every appearance of one post with a fresh payload. */
export function replaceInCycleList(list: FeedCycleList, next: FeedPostDto): FeedCycleList {
  return mapEntries(list, (post) => (post.id === next.id ? next : post));
}

/** Remove every appearance of one post (hide / archive / delete). */
export function removeFromCycleList(list: FeedCycleList, postId: string): FeedCycleList {
  return filterEntries(list, (post) => post.id !== postId);
}

/** Remove every appearance of every post by one author (block). */
export function removeAuthorFromCycleList(list: FeedCycleList, authorId: string): FeedCycleList {
  return filterEntries(list, (post) => post.author.id !== authorId);
}

/**
 * Which body string to show for the viewer's display language, honouring
 * `translationState`. `showingTranslation` reflects the user's manual toggle
 * once a translation is available.
 *
 * - `same_language` → always the source (no translation exists or is needed).
 * - `ready` → the translation is available; show it unless the user toggled
 *   back to the original.
 * - `pending` / `failed` / `none` → the original, so the reader is never
 *   blocked waiting for a translation.
 */
export function resolveDisplayText(
  post: Pick<FeedPostDto, "sourceText" | "displayText" | "translationState">,
  showingTranslation: boolean,
): string {
  if (
    showingTranslation &&
    post.translationState === "ready" &&
    typeof post.displayText === "string" &&
    post.displayText.length > 0
  ) {
    return post.displayText;
  }
  return post.sourceText;
}

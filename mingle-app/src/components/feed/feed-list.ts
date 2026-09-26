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

import type { FeedPostDto } from "@/lib/feed-post-dto";
import { generatePreviewText } from "@/lib/post-preview-text";

/**
 * Shared display rules for a post grid tile, extracted as pure functions so the
 * profile grid, search results, and the archive / trash / hidden lists all
 * agree and can be unit-tested without a DOM.
 */

export type GridTilePostFields = Pick<
  FeedPostDto,
  "sourceText" | "displayText" | "translationState"
>;

/**
 * Body text to show, following the default display-language policy:
 * - `ready`: the finished translation in `displayText`.
 * - anything else (`same_language`, `pending`, `failed`, `none`): the original
 *   `sourceText`. A grid tile never triggers or waits on a translation.
 * A null/blank `displayText` always falls back to `sourceText`.
 */
export function resolveGridTileText(post: GridTilePostFields): string {
  if (post.translationState === "ready") {
    const translated = post.displayText?.trim();
    if (translated) return post.displayText as string;
  }
  return post.sourceText;
}

/**
 * Preview snippet for a text-only tile (no image): the first ~20 characters in
 * large type, or the whole body when short. Reuses the feed's preview logic so
 * the truncation rule lives in one place.
 */
export function resolveGridTilePreview(post: GridTilePostFields): {
  text: string;
  isTruncated: boolean;
} {
  return generatePreviewText(resolveGridTileText(post));
}

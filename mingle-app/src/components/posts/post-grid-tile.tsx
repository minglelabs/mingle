"use client";

import type { ReactNode } from "react";
import type { FeedPostDto } from "@/lib/feed-post-dto";

/**
 * CONTRACT STUB — the profile/search UI replaces the body; the props are frozen.
 *
 * One square tile of a 3-column post grid. The profile grid, post search
 * results and the archive / trash / hidden-posts lists all render this, so the
 * thumbnail rule lives in exactly one place:
 * - With an image, the image is the thumbnail, whether or not there is text.
 * - Without one, the post's stored background with the first ~20 characters of
 *   the body in large type (a short body in full), sized and wrapped to stay
 *   inside the tile.
 * - Text follows the default display-language policy: `displayText` when the
 *   translation is ready, otherwise `sourceText`.
 * - No like or comment counts.
 */
export type PostGridTileProps = {
  post: Pick<FeedPostDto, "id" | "sourceText" | "displayText" | "translationState" | "backgroundKey" | "image">;
  locale: string;
  onSelect: (postId: string) => void;
  /** Corner badge for management lists, e.g. the days left in the trash. */
  badge?: ReactNode;
};

export default function PostGridTile(props: PostGridTileProps) {
  void props;
  return null;
}

"use client";

import type { FeedPostImageDto } from "@/lib/feed-post-dto";

/**
 * CONTRACT STUB — the feed UI replaces the body; the props are frozen.
 *
 * Non-interactive full-screen rendering of an unpublished post, drawn with the
 * same layout code as a real feed card so the compose preview cannot drift
 * from what gets published.
 */
export type FeedPostPreviewProps = {
  locale: string;
  text: string;
  backgroundKey: string;
  image: FeedPostImageDto | null;
  author: { name: string | null; handle: string; imageUrl: string | null };
};

export default function FeedPostPreview(props: FeedPostPreviewProps) {
  void props;
  return null;
}

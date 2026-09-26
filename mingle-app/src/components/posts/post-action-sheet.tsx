"use client";

import type { FeedPostDto } from "@/lib/feed-post-dto";

/**
 * CONTRACT STUB — the reports/moderation UI replaces the body; the props are frozen.
 *
 * The post "⋯" menu.
 * - Own post: edit (editPostHref), archive, delete (confirm, then trash).
 * - Someone else's post: report post, report author, hide post, block author.
 *   Hide and block apply immediately without a confirmation step.
 */
export type PostActionSheetProps = {
  open: boolean;
  post: Pick<FeedPostDto, "id" | "author" | "isMine" | "visibility">;
  locale: string;
  viewerId: string | null;
  onClose: () => void;
  /** The post left this viewer's list: hidden, archived or moved to trash. */
  onPostRemoved: (postId: string, reason: "hidden" | "archived" | "deleted") => void;
  /** The viewer blocked the author: drop every post by this author from the list. */
  onAuthorBlocked: (authorId: string) => void;
  onRequireLogin: () => void;
};

export default function PostActionSheet(props: PostActionSheetProps) {
  void props;
  return null;
}

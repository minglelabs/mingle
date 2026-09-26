"use client";

/**
 * CONTRACT STUB — the comments UI replaces the body; the props are frozen.
 *
 * Bottom sheet listing a post's comments and one-level replies. The feed card
 * opens it; while it is open the feed behind must not swipe.
 */
export type CommentSheetProps = {
  open: boolean;
  postId: string;
  postAuthorId: string;
  locale: string;
  /** null when signed out: the list is readable, writing and liking call onRequireLogin. */
  viewerId: string | null;
  /** Scroll to this comment or reply; a reply's collapsed thread is expanded first. */
  initialCommentId?: string | null;
  onClose: () => void;
  /** The post's comment count as the API reports it after a create or delete. */
  onCommentCountChange?: (commentCount: number) => void;
  onRequireLogin: () => void;
};

export default function CommentSheet(props: CommentSheetProps) {
  void props;
  return null;
}

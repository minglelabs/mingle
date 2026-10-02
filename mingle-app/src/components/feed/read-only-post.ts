import type { FeedPostDto } from "@/lib/feed-post-dto";

/**
 * The author opened their own archived or trashed post full-screen (archive /
 * trash tiles open the feed on that post). Likes and comments are closed for
 * such a post on the server, so the card is read-only: no like, no double-tap
 * like, no comments, and a status label on top.
 */
export type ReadOnlyPostKind = "archived" | "trashed";

export function readOnlyPostKind(post: Pick<FeedPostDto, "visibility" | "deletedAt">): ReadOnlyPostKind | null {
  if (post.deletedAt) return "trashed";
  if (post.visibility !== "public") return "archived";
  return null;
}

export function isReadOnlyPost(post: Pick<FeedPostDto, "visibility" | "deletedAt">): boolean {
  return readOnlyPostKind(post) !== null;
}

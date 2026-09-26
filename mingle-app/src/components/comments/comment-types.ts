/**
 * Client-side comment shapes. These mirror the JSON the comment read/write
 * routes emit (`src/app/api/posts/[postId]/comments/route.ts` and
 * `src/app/api/comments/[commentId]/**`). Kept in the comments feature folder
 * because they are the sheet's own wire contract, not a cross-team one.
 */

export type CommentTranslationState = 'same_language' | 'ready' | 'pending' | 'none' | 'failed'

export type CommentAuthor = {
  id: string
  handle: string
  name: string | null
  image: string | null
  /** Operator / official account; absent means false (same as post authors). */
  isOfficial?: boolean
}

export type CommentReplyToUser = {
  id: string
  handle: string
  name: string | null
}

/** One comment or reply as the list read returns it. */
export type CommentDto = {
  id: string
  postId: string
  authorId: string
  parentId: string | null
  replyToUserId: string | null
  bodyVersion: number
  /** Null when the comment is soft-deleted (body redacted). */
  sourceText: string | null
  sourceLanguage: string | null
  /** Body in the viewer's display language when ready, else the source. */
  displayText: string | null
  displayLanguage: string | null
  translationState: CommentTranslationState
  likeCount: number
  isDeleted: boolean
  edited: boolean
  createdAt: string
  updatedAt: string
  author: CommentAuthor
  replyToUser: CommentReplyToUser | null
  /** Live replies only. */
  replyCount: number
  liked: boolean
}

/** A top-level comment carries its one-level replies inline. */
export type CommentThreadDto = CommentDto & {
  replies: CommentDto[]
}

export type CommentListResponse = {
  comments: CommentThreadDto[]
  commentCount: number
  /** The language the server displays comments in; "See translation" requests this one. */
  displayLanguage: string | null
}

/** Client working copy — a thread we can mutate optimistically. */
export type CommentNode = CommentDto & {
  /** Set only on top-level comments. */
  replies?: CommentNode[]
  /** UI-only: an optimistic row not yet confirmed by the server. */
  pending?: boolean
  /** UI-only: this optimistic row failed to send; keep it with a retry. */
  failed?: boolean
  /** UI-only translation overlay for on-demand toggles. */
  translation?: {
    state: CommentTranslationState
    text: string | null
    /** Whether the viewer is currently shown the translation. */
    showing: boolean
  }
}

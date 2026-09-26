/**
 * Wire contract for every list that renders posts: the home feed, an author's
 * profile grid / full-screen viewer, and post search results.
 *
 * Server endpoints return exactly this shape and clients import only this
 * file, so a feed card, a grid thumbnail and a search result can never disagree
 * about what a post looks like. Change it here or nowhere.
 */

/**
 * How the body relates to the viewer's display language (the same default
 * display language the conversation bubbles use):
 * - `same_language` — written in the display language; no translation needed.
 * - `ready`         — `displayText` holds the translation; show it by default.
 * - `pending`       — a translation for the current body version is in flight.
 * - `failed`        — the last attempt failed; show the original + "See translation".
 * - `none`          — never requested for this language; "See translation" requests it.
 */
export type FeedPostTranslationState = 'same_language' | 'ready' | 'pending' | 'failed' | 'none'

export type FeedPostImageDto = {
  url: string
  /** Original pixel size, so the card keeps the aspect ratio without cropping. */
  width: number | null
  height: number | null
}

export type FeedPostDto = {
  id: string
  author: {
    id: string
    handle: string
    name: string | null
    imageUrl: string | null
  }
  /** Body exactly as written; line breaks and blank lines preserved. */
  sourceText: string
  sourceLanguage: string | null
  bodyVersion: number
  /** Body in `displayLanguage` when `translationState === 'ready'`, else null. */
  displayText: string | null
  displayLanguage: string | null
  translationState: FeedPostTranslationState
  /** A key of POST_BACKGROUND catalog in `@/lib/post-backgrounds`. */
  backgroundKey: string
  image: FeedPostImageDto | null
  likeCount: number
  commentCount: number
  likedByMe: boolean
  /** null when the viewer is signed out or is the author. */
  followingAuthor: boolean | null
  isMine: boolean
  /** ISO 8601. */
  publishedAt: string
  /** Only the author ever receives `archived` (own archive list). */
  visibility: 'public' | 'archived'
}

export type FeedPostListResponse = {
  posts: FeedPostDto[]
  nextCursor: string | null
}

/**
 * The one and only Prisma-row -> FeedPostDto converter.
 *
 * Every post-bearing server response (home feed, single post, profile grid,
 * search, archive, trash, hidden list) builds its wire payload here, so a feed
 * card, a grid thumbnail and a search result can never disagree about a post's
 * shape. See `@/lib/feed-post-dto` for the frozen contract.
 *
 * Serialization is list-oriented and N+1-free: a loader reads a page of post
 * rows, then makes ONE batched query each for the viewer's likes, follows and
 * the current-body-version translations, resolves the display language once,
 * and hands all of that to `serializeFeedPosts`. The converter is pure from
 * there on and never touches the database.
 */

import { canonicalizeTranslationLanguageCode } from '@/lib/translation-languages'
import type {
  FeedPostDto,
  FeedPostImageDto,
  FeedPostTranslationState,
} from '@/lib/feed-post-dto'

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------

/** The author columns every serialized post needs. */
export type SerializerAuthorRow = {
  id: string
  handle: string
  name: string | null
  image: string | null
}

/**
 * The post columns the serializer reads. A caller may `select` a superset;
 * only these fields are consumed.
 */
export type SerializerPostRow = {
  id: string
  authorId: string
  bodyVersion: number
  sourceText: string | null
  sourceLanguage: string | null
  backgroundKey: string | null
  imageObjectKey: string | null
  /**
   * Stored pixel size of the processed image (see post-image-upload). Optional
   * so a caller whose `select` predates the columns still type-checks; missing
   * reads as unknown (null).
   */
  imageWidth?: number | null
  imageHeight?: number | null
  visibility: string
  deletedAt: Date | null
  likeCount: number
  commentCount: number
  publishedAt: Date
  author: SerializerAuthorRow
}

/** A translation of the CURRENT body version, keyed by post + language. */
export type SerializerTranslationRow = {
  postId: string
  bodyVersion: number
  language: string
  status: string
  text: string | null
}

/**
 * Everything the pure converter needs beyond the rows themselves, gathered by
 * the loader with batched queries.
 */
export type SerializerContext = {
  /** Viewer id, or null for a signed-out reader. */
  viewerId: string | null
  /**
   * The resolved display language for this request (see
   * `resolveDisplayLanguage`), or null when neither the query nor the viewer's
   * default yields a supported code.
   */
  displayLanguage: string | null
  /** Post ids the viewer liked. Empty for a signed-out reader. */
  likedPostIds: ReadonlySet<string>
  /** Author ids the viewer follows. Empty for a signed-out reader. */
  followedAuthorIds: ReadonlySet<string>
  /**
   * Current-body-version translations for the resolved display language,
   * indexed by postId. Ready and non-ready alike, so the converter can tell
   * `ready` from `pending` / `failed` / `none`.
   */
  translationByPostId: ReadonlyMap<string, SerializerTranslationRow>
  /**
   * When true a post's `deletedAt` is surfaced (trash list only). Every other
   * list forces it to null even if a row carries a value.
   */
  includeDeletedAt?: boolean
}

// ---------------------------------------------------------------------------
// Display-language resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the effective display language: the request query when it
 * canonicalizes, else the viewer's default when it canonicalizes, else null.
 */
export function resolveDisplayLanguage(
  rawDisplayLanguage: string | null,
  viewerDefaultDisplayLanguage: string | null,
): string | null {
  // The planning rule: posts and comments use the same default display language
  // the viewer set for collapsed conversation bubbles (User.defaultDisplayLanguage).
  // The request value (the client's UI locale) only fills in when there is no
  // saved setting — a signed-out reader, or an account that never chose one.
  const fromDefault = viewerDefaultDisplayLanguage
    ? canonicalizeTranslationLanguageCode(viewerDefaultDisplayLanguage)
    : ''
  if (fromDefault) return fromDefault
  const fromRequest = rawDisplayLanguage ? canonicalizeTranslationLanguageCode(rawDisplayLanguage) : ''
  return fromRequest || null
}

// ---------------------------------------------------------------------------
// Image
// ---------------------------------------------------------------------------

/**
 * Resolve the post image to its wire shape. Images live in the private post
 * image bucket and are served through the app's own `GET /api/posts/{id}/image`
 * route, so the URL is that path — not a public bucket URL. It is deliberately
 * the unversioned path: this runs on the server, where `buildClientApiPath`
 * would resolve the namespace from build-time env (no browser, no platform) and
 * could emit a namespace such as `ios/v2.0.0` that has no image route at all.
 *
 * `width`/`height` are the stored pixel size of the processed image (recorded
 * at upload, saved with the post). Rows created before the columns existed, or
 * a pair that is not two positive integers, yield null for both so the card
 * falls back to the decoded image's aspect ratio.
 */
export function serializePostImage(
  postId: string,
  imageObjectKey: string | null,
  imageWidth?: number | null,
  imageHeight?: number | null,
): FeedPostImageDto | null {
  if (!imageObjectKey) return null
  const valid = isPositiveInt(imageWidth) && isPositiveInt(imageHeight)
  return {
    url: `/api/posts/${encodeURIComponent(postId)}/image`,
    width: valid ? imageWidth : null,
    height: valid ? imageHeight : null,
  }
}

function isPositiveInt(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

// ---------------------------------------------------------------------------
// Translation state
// ---------------------------------------------------------------------------

/**
 * Derive `{ translationState, displayText, displayLanguage }` for one post.
 *
 * - No resolved display language -> `none`, original shown, displayLanguage null.
 * - Original language == display language -> `same_language`.
 * - Otherwise the CURRENT body-version translation for that language decides:
 *   ready -> `ready` (displayText = translation), pending -> `pending`,
 *   failed -> `failed`, missing -> `none`. Earlier body versions are never
 *   consulted because the loader only ever indexes current-version rows.
 */
export function deriveTranslation(
  post: Pick<SerializerPostRow, 'sourceLanguage'>,
  displayLanguage: string | null,
  translation: SerializerTranslationRow | undefined,
): { translationState: FeedPostTranslationState; displayText: string | null; displayLanguage: string | null } {
  if (!displayLanguage) {
    return { translationState: 'none', displayText: null, displayLanguage: null }
  }

  const canonicalSource = post.sourceLanguage
    ? canonicalizeTranslationLanguageCode(post.sourceLanguage)
    : ''
  if (canonicalSource && canonicalSource === displayLanguage) {
    return { translationState: 'same_language', displayText: null, displayLanguage }
  }

  if (!translation) {
    return { translationState: 'none', displayText: null, displayLanguage }
  }
  if (translation.status === 'ready') {
    return { translationState: 'ready', displayText: translation.text ?? null, displayLanguage }
  }
  if (translation.status === 'failed') {
    return { translationState: 'failed', displayText: null, displayLanguage }
  }
  // Anything else in flight (pending / processing) reads as pending.
  return { translationState: 'pending', displayText: null, displayLanguage }
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

/** Serialize one post row into a FeedPostDto. */
export function serializeFeedPost(post: SerializerPostRow, ctx: SerializerContext): FeedPostDto {
  const isMine = ctx.viewerId != null && ctx.viewerId === post.authorId
  const { translationState, displayText, displayLanguage } = deriveTranslation(
    post,
    ctx.displayLanguage,
    ctx.translationByPostId.get(post.id),
  )

  return {
    id: post.id,
    author: {
      id: post.author.id,
      handle: post.author.handle,
      name: post.author.name,
      imageUrl: post.author.image,
    },
    sourceText: post.sourceText ?? '',
    sourceLanguage: post.sourceLanguage,
    bodyVersion: post.bodyVersion,
    displayText,
    displayLanguage,
    translationState,
    backgroundKey: post.backgroundKey ?? '',
    image: serializePostImage(post.id, post.imageObjectKey, post.imageWidth, post.imageHeight),
    likeCount: post.likeCount,
    commentCount: post.commentCount,
    likedByMe: ctx.viewerId != null && ctx.likedPostIds.has(post.id),
    followingAuthor:
      ctx.viewerId == null || isMine ? null : ctx.followedAuthorIds.has(post.authorId),
    isMine,
    publishedAt: post.publishedAt.toISOString(),
    visibility: post.visibility === 'archived' ? 'archived' : 'public',
    deletedAt: ctx.includeDeletedAt ? post.deletedAt?.toISOString() ?? null : null,
  }
}

/** Serialize a page of post rows into FeedPostDto[] in the given order. */
export function serializeFeedPosts(posts: readonly SerializerPostRow[], ctx: SerializerContext): FeedPostDto[] {
  return posts.map((post) => serializeFeedPost(post, ctx))
}

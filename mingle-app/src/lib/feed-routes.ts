/**
 * Every page route and list endpoint of the posting feature, in one place.
 *
 * Screens link to each other only through these builders (never a hand-written
 * path string), so a route renamed here is renamed everywhere and two screens
 * built in parallel cannot disagree about where the other one lives.
 */

/** Where a full-screen vertical post list takes its posts from. */
export type FeedSource =
  | { kind: 'home' }
  | { kind: 'author'; authorId: string }
  | { kind: 'search'; query: string }

function withQuery(path: string, params: Record<string, string | null | undefined>): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value)
  }
  const serialized = query.toString()
  return serialized ? `${path}?${serialized}` : path
}

// ---------------------------------------------------------------------------
// Page routes (pass the result to router.push / <Link href>)
// ---------------------------------------------------------------------------

/** Home feed. With `postId`, that post opens first; with `commentId`, its comment sheet opens on that comment. */
export function feedHref(locale: string, target?: { postId?: string | null; commentId?: string | null }): string {
  return withQuery(`/${locale}/feed`, { postId: target?.postId, commentId: target?.commentId })
}

/** Full-screen viewer limited to one author's posts or one search's post results, starting at `startPostId`. */
export function postViewerHref(
  locale: string,
  source: Exclude<FeedSource, { kind: 'home' }>,
  startPostId: string,
): string {
  return source.kind === 'author'
    ? withQuery(`/${locale}/posts/viewer`, { kind: 'author', authorId: source.authorId, postId: startPostId })
    : withQuery(`/${locale}/posts/viewer`, { kind: 'search', q: source.query, postId: startPostId })
}

/** Compose entry: "new post" + the account's drafts. With `draftId`, that draft opens in the editor. */
export function composeHref(locale: string, options?: { draftId?: string | null }): string {
  return withQuery(`/${locale}/compose`, { draftId: options?.draftId })
}

export function editPostHref(locale: string, postId: string): string {
  return `/${locale}/posts/${encodeURIComponent(postId)}/edit`
}

export type MyPostsSection = 'archived' | 'trash' | 'hidden'

/** The author's archive, trash (30-day restore) and the viewer's hidden-posts list. */
export function myPostsHref(locale: string, section: MyPostsSection): string {
  return `/${locale}/mypage/posts/${section}`
}

/** Unified notification center (follows, likes, comments, replies, report results). */
export function notificationsHref(locale: string): string {
  return `/${locale}/notifications`
}

/** Full people list for a search ("See all"). */
export function searchPeopleHref(locale: string, query: string): string {
  return withQuery(`/${locale}/connect/search/people`, { q: query })
}

// ---------------------------------------------------------------------------
// List endpoints (pass the result to buildClientApiPath from @/lib/api-contract)
// Each returns FeedPostListResponse from @/lib/feed-post-dto.
// ---------------------------------------------------------------------------

export function feedSourceEndpoint(
  source: FeedSource,
  page: { cursor?: string | null; limit?: number | null; displayLanguage?: string | null },
): `/${string}` {
  const shared = {
    cursor: page.cursor,
    limit: page.limit ? String(page.limit) : null,
    displayLanguage: page.displayLanguage,
  }
  switch (source.kind) {
    case 'home':
      return withQuery('/feed', shared) as `/${string}`
    case 'author':
      return withQuery(`/users/${encodeURIComponent(source.authorId)}/posts`, shared) as `/${string}`
    case 'search':
      return withQuery('/search/posts', { q: source.query, ...shared }) as `/${string}`
  }
}

/**
 * Which post a follow or a first message is credited to.
 *
 * Follows and messages happen on the author, not on a post, so each one is
 * tied to at most one of that author's posts:
 *
 * 1. A follow made from a post carries that post's id (`UserFollow.sourcePostId`:
 *    the feed card's "+", or the follow button of a profile opened from the
 *    post). It is credited to that post.
 * 2. Every other follow, and every first message (the first message a person
 *    ever sent in a room the author was in), is credited to the author's post
 *    the person touched most recently in the 24 hours before the action. A
 *    touch is the post's view record (PostView, the FIRST time the person saw
 *    the post) or a visit to the author's profile opened from the post
 *    (ProfileView.sourcePostId). A touch at the very moment of the action
 *    counts; one after it does not. Equal times go to the larger post id, so
 *    the result never depends on row order.
 * 3. No touch in that window: the action is credited to no post.
 *
 * Each (person, author) pair has at most one follow (unfollowing deletes the
 * row; following again starts a new one) and one first message, so a post's
 * follows and messages are distinct people.
 */

export const ATTRIBUTION_WINDOW_MS = 24 * 60 * 60 * 1000

export type ConversionKind = 'follow' | 'message'

export type ConversionEvent = {
  kind: ConversionKind
  viewerId: string
  authorId: string
  at: Date
  /** Rule 1: the post the action was made from (follows only). */
  sourcePostId: string | null
}

/** A view of one of the author's posts, or a profile visit opened from it. */
export type Touchpoint = { postId: string; at: Date }

/** The post `event` is credited to, or null (rules 1-3 above). */
export function attributeConversion(
  event: ConversionEvent,
  touchpoints: readonly Touchpoint[],
  windowMs: number = ATTRIBUTION_WINDOW_MS,
): string | null {
  if (event.sourcePostId) return event.sourcePostId
  const actionMs = event.at.getTime()
  let best: Touchpoint | null = null
  for (const touch of touchpoints) {
    const ageMs = actionMs - touch.at.getTime()
    if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > windowMs) continue
    if (
      !best
      || touch.at.getTime() > best.at.getTime()
      || (touch.at.getTime() === best.at.getTime() && touch.postId > best.postId)
    ) {
      best = touch
    }
  }
  return best?.postId ?? null
}

/** One row of the attribution query: an event and one candidate touch (null when it has none). */
export type ConversionCandidateRow = {
  kind: ConversionKind
  viewerId: string
  authorId: string
  at: Date
  sourcePostId: string | null
  touchPostId: string | null
  touchAt: Date | null
}

export type ConversionCounts = { follows: number; messages: number }

/**
 * Groups the candidate rows back into events, credits each one, and counts
 * the credited events per post. Only posts in `postIds` are counted; an event
 * credited to another post of the author is still taken away from these.
 */
export function countConversions(
  rows: readonly ConversionCandidateRow[],
  postIds: Iterable<string>,
  windowMs: number = ATTRIBUTION_WINDOW_MS,
): Map<string, ConversionCounts> {
  const events = new Map<string, { event: ConversionEvent; touchpoints: Touchpoint[] }>()
  for (const row of rows) {
    const key = `${row.kind}\u0000${row.viewerId}\u0000${row.authorId}`
    let entry = events.get(key)
    if (!entry) {
      entry = {
        event: { kind: row.kind, viewerId: row.viewerId, authorId: row.authorId, at: row.at, sourcePostId: row.sourcePostId },
        touchpoints: [],
      }
      events.set(key, entry)
    }
    if (row.touchPostId && row.touchAt) entry.touchpoints.push({ postId: row.touchPostId, at: row.touchAt })
  }

  const counts = new Map<string, ConversionCounts>()
  for (const postId of postIds) counts.set(postId, { follows: 0, messages: 0 })
  for (const { event, touchpoints } of events.values()) {
    const postId = attributeConversion(event, touchpoints, windowMs)
    const count = postId ? counts.get(postId) : undefined
    if (!count) continue
    if (event.kind === 'follow') count.follows += 1
    else count.messages += 1
  }
  return counts
}

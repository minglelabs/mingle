/**
 * Feed ranking – pure functions.
 *
 * Sorting order:
 *   1. Unseen posts before seen posts
 *   2. Within each group: followed authors before non-followed
 *   3. Within each sub-group: time tier (more recent tier first)
 *   4. Within same tier: reaction score descending
 *   5. Tiebreak: publishedAt desc, then id desc (deterministic — the feed pages
 *      the ranked list by offset, so the order must not vary between requests)
 *   6. Post-sort: avoid consecutive posts by the same author, only by moving a
 *      post inside its own (unseen/seen × followed/not) group
 *
 * All functions are free of side effects and DB calls so they can be unit-tested trivially.
 */

// ---------------------------------------------------------------------------
// Time tiers
// ---------------------------------------------------------------------------

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

/** Tier boundaries in milliseconds from `now`. Lower index = more recent. */
const TIER_BOUNDARIES_MS = [
  1 * HOUR,       // tier 0: ≤ 1 h
  6 * HOUR,       // tier 1: ≤ 6 h
  24 * HOUR,      // tier 2: ≤ 24 h
  3 * DAY,        // tier 3: ≤ 3 d
  7 * DAY,        // tier 4: ≤ 1 w
  30 * DAY,       // tier 5: ≤ 1 M
] as const

/** Number of time tiers (0..6, where 6 = older than 1 month). */
export const TIER_COUNT = TIER_BOUNDARIES_MS.length + 1

/**
 * Map a post's published timestamp to a time tier (0 = most recent, 6 = oldest).
 * Posts older than 1 month land in tier 6.
 */
export function timeTier(publishedAt: Date, now: Date): number {
  const ageMs = now.getTime() - publishedAt.getTime()
  for (let i = 0; i < TIER_BOUNDARIES_MS.length; i++) {
    if (ageMs <= TIER_BOUNDARIES_MS[i]) return i
  }
  return TIER_BOUNDARIES_MS.length // tier 6
}

// ---------------------------------------------------------------------------
// Reaction score
// ---------------------------------------------------------------------------

/**
 * Compute the reaction score for a single post.
 *
 * @param likeCount          Total likes on the post.
 * @param uniqueCommenterIds Set of user IDs who left at least one comment,
 *                           **excluding** the post author.
 */
export function reactionScore(
  likeCount: number,
  uniqueCommenterIds: Set<string>,
): number {
  return likeCount + uniqueCommenterIds.size * 2
}

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

export interface FeedCandidate {
  id: string
  authorId: string
  publishedAt: Date
  likeCount: number
  /** Unique commenter user IDs, excluding the post author. */
  uniqueCommenterIds: Set<string>
  /** Whether the viewer has seen this post. */
  viewed: boolean
}

export interface ScoredPost {
  id: string
  authorId: string
  viewed: boolean
  isFollowed: boolean
  tier: number
  score: number
}

export interface RankFeedOptions {
  /**
   * Author of the card shown right before this list (the last card of the
   * previous cycle). The first slot avoids this author when its group has an
   * alternative, so a cycle boundary does not show one author twice in a row.
   */
  avoidFirstAuthorId?: string | null
}

/**
 * Rank an array of feed candidates and return their IDs in display order.
 * The same inputs always produce the same order (see tiebreak above).
 *
 * @param candidates       All visible post candidates.
 * @param followedAuthorIds IDs of authors the viewer follows.
 * @param now              Reference timestamp for time-tier computation.
 */
export function rankFeed(
  candidates: FeedCandidate[],
  followedAuthorIds: Set<string>,
  now: Date,
  options: RankFeedOptions = {},
): string[] {
  if (candidates.length === 0) return []

  // Score every candidate
  const scored = candidates.map((c) => ({
    id: c.id,
    authorId: c.authorId,
    viewed: c.viewed,
    isFollowed: followedAuthorIds.has(c.authorId),
    tier: timeTier(c.publishedAt, now),
    score: reactionScore(c.likeCount, c.uniqueCommenterIds),
    publishedAtMs: c.publishedAt.getTime(),
  }))

  scored.sort((a, b) => {
    // 1. Unseen before seen
    if (a.viewed !== b.viewed) return a.viewed ? 1 : -1
    // 2. Followed before non-followed
    if (a.isFollowed !== b.isFollowed) return a.isFollowed ? -1 : 1
    // 3. More recent tier first (lower number = more recent)
    if (a.tier !== b.tier) return a.tier - b.tier
    // 4. Higher reaction score first
    if (a.score !== b.score) return b.score - a.score
    // 5. Deterministic tiebreak: publishedAt DESC, then id DESC
    if (a.publishedAtMs !== b.publishedAtMs) return b.publishedAtMs - a.publishedAtMs
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0
  })

  // Post-sort: avoid consecutive same-author posts when alternatives exist
  return avoidConsecutiveAuthors(scored, options.avoidFirstAuthorId ?? null)
}

// ---------------------------------------------------------------------------
// Consecutive-author avoidance
// ---------------------------------------------------------------------------

/** Ranking group. A post never moves out of its group to break an author run. */
function groupOf(p: ScoredPost): number {
  return (p.viewed ? 2 : 0) + (p.isFollowed ? 0 : 1)
}

/**
 * Reorder to avoid consecutive posts from the same author across the WHOLE
 * list, without moving any post out of its ranking group
 * (unseen/seen × followed/not-followed): a seen or non-followed post is never
 * pulled in front of an unseen or followed one.
 *
 * For each slot whose author equals the previous card's author (for slot 0:
 * `avoidFirstAuthorId`), the NEAREST later post of the same group by another
 * author moves into that slot; the posts in between shift back by one and
 * keep their relative order. When the rest of the group is all that author,
 * the run is unavoidable and the scan jumps to the next group.
 */
export function avoidConsecutiveAuthors(
  sorted: ScoredPost[],
  avoidFirstAuthorId: string | null = null,
): string[] {
  const result = [...sorted]

  for (let i = 0; i < result.length; i++) {
    const prevAuthor = i === 0 ? avoidFirstAuthorId : result[i - 1].authorId
    if (prevAuthor === null || result[i].authorId !== prevAuthor) continue

    const group = groupOf(result[i])
    let pick = -1
    let groupEnd = result.length
    for (let j = i + 1; j < result.length; j++) {
      if (groupOf(result[j]) !== group) {
        groupEnd = j
        break
      }
      if (result[j].authorId !== prevAuthor) {
        pick = j
        break
      }
    }

    if (pick === -1) {
      // The rest of this group is all prevAuthor: nothing to swap in.
      i = groupEnd - 1
      continue
    }

    const [moved] = result.splice(pick, 1)
    result.splice(i, 0, moved)
  }

  return result.map((p) => p.id)
}

// ---------------------------------------------------------------------------
// Cursor
// ---------------------------------------------------------------------------

export interface FeedCursor {
  /** Snapshot reference time – posts published after this are excluded. */
  snapshotAt: string
  /** Offset into the snapshot's ranked list. */
  offset: number
  /** Legacy field, kept so older cursors still decode. Not used for ranking. */
  viewedPhase: boolean
  /**
   * Author of the last card of the previous cycle. A ranking input for the
   * whole cycle, so a recompute (cache miss) yields the same order.
   */
  avoidFirstAuthorId?: string | null
  /**
   * The previous cycle ended. The server opens a NEW snapshot at the moment
   * this cursor is used (so views of the last page are reflected), offset 0.
   */
  restart?: boolean
}

export function encodeCursor(cursor: FeedCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url')
}

export function decodeCursor(raw: string): FeedCursor | null {
  try {
    const json = JSON.parse(Buffer.from(raw, 'base64url').toString('utf-8'))
    if (
      !json ||
      typeof json.snapshotAt !== 'string' ||
      Number.isNaN(Date.parse(json.snapshotAt)) ||
      typeof json.offset !== 'number' ||
      !Number.isInteger(json.offset) ||
      json.offset < 0 ||
      typeof json.viewedPhase !== 'boolean'
    ) {
      return null
    }
    const cursor: FeedCursor = {
      snapshotAt: json.snapshotAt,
      offset: json.offset,
      viewedPhase: json.viewedPhase,
    }
    if (typeof json.avoidFirstAuthorId === 'string') cursor.avoidFirstAuthorId = json.avoidFirstAuthorId
    if (json.restart === true) cursor.restart = true
    return cursor
  } catch {
    return null
  }
}

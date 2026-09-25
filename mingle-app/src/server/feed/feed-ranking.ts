/**
 * Feed ranking – pure functions.
 *
 * Sorting order:
 *   1. Unseen posts before seen posts
 *   2. Within each group: followed authors before non-followed
 *   3. Within each sub-group: time tier (more recent tier first)
 *   4. Within same tier: reaction score descending
 *   5. Post-sort: avoid consecutive posts by the same author (when alternatives exist)
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

interface ScoredPost {
  id: string
  authorId: string
  viewed: boolean
  isFollowed: boolean
  tier: number
  score: number
}

/**
 * Rank an array of feed candidates and return their IDs in display order.
 *
 * @param candidates       All visible post candidates.
 * @param followedAuthorIds IDs of authors the viewer follows.
 * @param now              Reference timestamp for time-tier computation.
 */
export function rankFeed(
  candidates: FeedCandidate[],
  followedAuthorIds: Set<string>,
  now: Date,
): string[] {
  if (candidates.length === 0) return []

  // Score every candidate
  const scored: ScoredPost[] = candidates.map((c) => ({
    id: c.id,
    authorId: c.authorId,
    viewed: c.viewed,
    isFollowed: followedAuthorIds.has(c.authorId),
    tier: timeTier(c.publishedAt, now),
    score: reactionScore(c.likeCount, c.uniqueCommenterIds),
  }))

  // Sort: unseen first → followed first → lower tier first → higher score first
  scored.sort((a, b) => {
    // 1. Unseen before seen
    if (a.viewed !== b.viewed) return a.viewed ? 1 : -1
    // 2. Followed before non-followed
    if (a.isFollowed !== b.isFollowed) return a.isFollowed ? -1 : 1
    // 3. More recent tier first (lower number = more recent)
    if (a.tier !== b.tier) return a.tier - b.tier
    // 4. Higher reaction score first
    return b.score - a.score
  })

  // Post-sort: avoid consecutive same-author posts when alternatives exist
  return avoidConsecutiveAuthors(scored)
}

// ---------------------------------------------------------------------------
// Consecutive-author avoidance
// ---------------------------------------------------------------------------

/**
 * Reorder to avoid consecutive posts from the same author, only when there
 * is an alternative candidate within a small look-ahead window that would
 * not break the ordering significantly.
 *
 * Algorithm: greedy swap within a look-ahead of 5. For each position, if
 * the candidate has the same authorId as the previous post, scan ahead for
 * the first candidate with a different author and swap them.
 */
export function avoidConsecutiveAuthors(sorted: ScoredPost[]): string[] {
  const result = [...sorted]
  const LOOKAHEAD = 5

  for (let i = 1; i < result.length; i++) {
    if (result[i].authorId === result[i - 1].authorId) {
      // Find the nearest swap candidate within lookahead
      let swapIdx = -1
      for (let j = i + 1; j < Math.min(i + LOOKAHEAD, result.length); j++) {
        if (result[j].authorId !== result[i - 1].authorId) {
          swapIdx = j
          break
        }
      }
      if (swapIdx !== -1) {
        const tmp = result[i]
        result[i] = result[swapIdx]
        result[swapIdx] = tmp
      }
    }
  }

  return result.map((p) => p.id)
}

// ---------------------------------------------------------------------------
// Cursor
// ---------------------------------------------------------------------------

export interface FeedCursor {
  /** Snapshot reference time – posts published after this are excluded. */
  snapshotAt: string
  /** Offset into the ranked list. */
  offset: number
  /** Whether we have exhausted unseen posts and moved into seen-post phase. */
  viewedPhase: boolean
}

export function encodeCursor(cursor: FeedCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url')
}

export function decodeCursor(raw: string): FeedCursor | null {
  try {
    const json = JSON.parse(Buffer.from(raw, 'base64url').toString('utf-8'))
    if (
      typeof json.snapshotAt !== 'string' ||
      typeof json.offset !== 'number' ||
      typeof json.viewedPhase !== 'boolean'
    ) {
      return null
    }
    return json as FeedCursor
  } catch {
    return null
  }
}
